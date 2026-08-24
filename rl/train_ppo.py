"""PPO self-play scaffold for Hullcracker (2026-08-24). BUILT, NOT YET RUN AT
SCALE — a starting point, not a tuned trainer.

One shared policy drives every agent in every worker (pure self-play). The
policy is an MLP over the featurized observation with one categorical head
per action dimension (MultiDiscrete) and a value head. Rewards are combined
HERE from the env's components — reward-shaping iteration never touches TS:

    python3 rl/train_ppo.py --workers 6 --agents 20 \
        --w-dmg 0.01 --w-hplost -0.005 --w-kill 0.5 --w-alive 0.0005 --w-win 5

Checkpoints land in rl/checkpoints/. Torch is imported lazily so everything
else in rl/ works without it installed.

Honest expectations (see rl/README.md): the first converged policy will find
a degenerate strategy. That is the loop working — adjust weights, retrain.
League/population training (tier 2) deliberately does not live here yet.
"""
from __future__ import annotations

import argparse
import pathlib
import time

from env_client import VecHullcracker

CKPT_DIR = pathlib.Path(__file__).resolve().parent / "checkpoints"


def parse_args():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--agents", type=int, default=20)
    ap.add_argument("--bots", type=int, default=0, help="scripted opponents per match (curriculum)")
    ap.add_argument("--decision-ticks", type=int, default=5)
    ap.add_argument("--rollout", type=int, default=256, help="decisions per worker per update")
    ap.add_argument("--updates", type=int, default=1000)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--gamma", type=float, default=0.999)
    ap.add_argument("--gae-lambda", type=float, default=0.95)
    ap.add_argument("--clip", type=float, default=0.2)
    ap.add_argument("--entropy", type=float, default=0.01)
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--minibatch", type=int, default=4096)
    ap.add_argument("--w-dmg", type=float, default=0.01)
    ap.add_argument("--w-hplost", type=float, default=-0.005)
    ap.add_argument("--w-kill", type=float, default=0.5)
    ap.add_argument("--w-alive", type=float, default=0.0005)
    ap.add_argument("--w-win", type=float, default=5.0)
    ap.add_argument("--resume", type=str, default=None)
    return ap.parse_args()


def main() -> int:
    args = parse_args()
    try:
        import numpy as np
        import torch
        import torch.nn as nn
    except ImportError as e:
        print(f"train_ppo needs numpy+torch (pip install -r rl/requirements.txt): {e}")
        return 1

    vec = VecHullcracker(args.workers, args.agents, bots=args.bots,
                         decision_ticks=args.decision_ticks)
    spec = vec.spec
    bins = [spec.action_bins[k] for k in ("rudder", "throttle", "fire", "bearing", "range", "slot", "boost")]
    weights = np.array([args.w_dmg, args.w_hplost, args.w_kill, args.w_alive, args.w_win], dtype=np.float32)
    n_env_agents = args.workers * args.agents  # one policy, this many streams

    class Policy(nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.trunk = nn.Sequential(
                nn.Linear(spec.feature_dim, 512), nn.Tanh(),
                nn.Linear(512, 256), nn.Tanh(),
            )
            self.heads = nn.ModuleList([nn.Linear(256, b) for b in bins])
            self.value = nn.Linear(256, 1)

        def forward(self, x):
            h = self.trunk(x)
            return [head(h) for head in self.heads], self.value(h).squeeze(-1)

        def act(self, x):
            logits, v = self(x)
            dists = [torch.distributions.Categorical(logits=lg) for lg in logits]
            acts = [d.sample() for d in dists]
            logp = torch.stack([d.log_prob(a) for d, a in zip(dists, acts)], -1).sum(-1)
            return torch.stack(acts, -1), logp, v

        def evaluate(self, x, acts):
            logits, v = self(x)
            dists = [torch.distributions.Categorical(logits=lg) for lg in logits]
            logp = torch.stack([d.log_prob(acts[:, i]) for i, d in enumerate(dists)], -1).sum(-1)
            ent = torch.stack([d.entropy() for d in dists], -1).sum(-1)
            return logp, ent, v

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    policy = Policy().to(device)
    if args.resume:
        policy.load_state_dict(torch.load(args.resume, map_location=device))
        print(f"resumed from {args.resume}")
    optim = torch.optim.Adam(policy.parameters(), lr=args.lr)
    CKPT_DIR.mkdir(exist_ok=True)

    obs = np.asarray(vec.reset(), dtype=np.float32).reshape(n_env_agents, spec.feature_dim)
    wins_seen = 0
    episodes = 0
    t0 = time.time()

    for update in range(1, args.updates + 1):
        buf_obs, buf_act, buf_logp, buf_val, buf_rew, buf_done = [], [], [], [], [], []
        for _ in range(args.rollout):
            with torch.no_grad():
                acts, logp, val = policy.act(torch.as_tensor(obs, device=device))
            acts_np = acts.cpu().numpy()
            per_worker = acts_np.reshape(args.workers, args.agents, len(bins)).tolist()
            nobs, rewards, dones, infos = vec.step(per_worker)
            rew = (np.asarray(rewards, dtype=np.float32)
                   .reshape(n_env_agents, len(weights)) @ weights)
            done_flags = np.repeat(np.asarray(dones, dtype=np.float32), args.agents)
            for info in infos:
                if info.get("terminal"):
                    episodes += 1
                    wins_seen += sum(1 for p in (info.get("placements") or []) if p == 1)
            buf_obs.append(obs)
            buf_act.append(acts_np)
            buf_logp.append(logp.cpu().numpy())
            buf_val.append(val.cpu().numpy())
            buf_rew.append(rew)
            buf_done.append(done_flags)
            obs = np.asarray(nobs, dtype=np.float32).reshape(n_env_agents, spec.feature_dim)

        # GAE over the rollout (bootstrapped from the last value).
        with torch.no_grad():
            _, _, last_v = policy.evaluate(
                torch.as_tensor(obs, device=device),
                torch.zeros((n_env_agents, len(bins)), dtype=torch.long, device=device))
        adv = np.zeros((args.rollout, n_env_agents), dtype=np.float32)
        last_gae = np.zeros(n_env_agents, dtype=np.float32)
        next_v = last_v.cpu().numpy()
        for t in reversed(range(args.rollout)):
            nonterm = 1.0 - buf_done[t]
            delta = buf_rew[t] + args.gamma * next_v * nonterm - buf_val[t]
            last_gae = delta + args.gamma * args.gae_lambda * nonterm * last_gae
            adv[t] = last_gae
            next_v = buf_val[t]
        ret = adv + np.stack(buf_val)

        t_obs = torch.as_tensor(np.stack(buf_obs).reshape(-1, spec.feature_dim), device=device)
        t_act = torch.as_tensor(np.stack(buf_act).reshape(-1, len(bins)), dtype=torch.long, device=device)
        t_logp = torch.as_tensor(np.stack(buf_logp).reshape(-1), device=device)
        t_adv = torch.as_tensor(adv.reshape(-1), device=device)
        t_ret = torch.as_tensor(ret.reshape(-1), device=device)
        t_adv = (t_adv - t_adv.mean()) / (t_adv.std() + 1e-8)

        idx = np.arange(len(t_obs))
        for _ in range(args.epochs):
            np.random.shuffle(idx)
            for start in range(0, len(idx), args.minibatch):
                mb = torch.as_tensor(idx[start:start + args.minibatch], device=device)
                logp, ent, v = policy.evaluate(t_obs[mb], t_act[mb])
                ratio = (logp - t_logp[mb]).exp()
                pg = -torch.min(ratio * t_adv[mb],
                                ratio.clamp(1 - args.clip, 1 + args.clip) * t_adv[mb]).mean()
                vloss = 0.5 * (v - t_ret[mb]).pow(2).mean()
                loss = pg + vloss - args.entropy * ent.mean()
                optim.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(policy.parameters(), 0.5)
                optim.step()

        if update % 10 == 0 or update == 1:
            dps = args.rollout * n_env_agents * update / (time.time() - t0)
            print(f"update {update}/{args.updates} episodes={episodes} "
                  f"agent-wins={wins_seen} throughput={dps:.0f} decisions/s")
            torch.save(policy.state_dict(), CKPT_DIR / f"ppo-{update:05d}.pt")
    vec.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

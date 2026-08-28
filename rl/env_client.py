"""Vectorized client for the Hullcracker RL env workers (scaffold, 2026-08-24).

Spawns N `server/scripts/rl/worker.ts` processes (the sim stays TypeScript —
byte-identical to the shipped game; only observations/actions cross the
bridge) and exposes a simple vectorized API:

    vec = VecHullcracker(n_workers=6, agents=20, bots=0)
    obs = vec.reset(seeds=[1, 2, 3, 4, 5, 6])       # [worker][agent][dim]
    obs, rewards, dones, infos = vec.step(actions)   # actions [worker][agent][7]

Protocol: newline-delimited JSON over stdio, one response line per request
(see worker.ts header). Plain JSON is fine at scaffold scale; if the bridge
ever bottlenecks, swap transports without touching env.ts.
"""
from __future__ import annotations

import json
import os
import pathlib
import subprocess
from dataclasses import dataclass

REPO = pathlib.Path(__file__).resolve().parent.parent
WORKER = REPO / "server/scripts/rl/worker.ts"
TSX = REPO / "node_modules/.bin/tsx"
TSCONFIG = REPO / "server/scripts/rl/tsconfig.json"


@dataclass
class EnvSpec:
    feature_dim: int
    feature_version: int
    action_bins: dict
    reward_components: list


class Worker:
    """One env worker process; blocking request/response."""

    def __init__(self) -> None:
        env = dict(os.environ, HC_DEV_OPTIONS="1", HC_BALANCE="1")
        self.proc = subprocess.Popen(
            ["node", str(TSX), "--tsconfig", str(TSCONFIG), str(WORKER)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            cwd=str(REPO), env=env, text=True, bufsize=1,
        )
        hello = self._call({"cmd": "hello"})
        self.spec = EnvSpec(hello["featureDim"], hello["featureVersion"],
                            hello["actionBins"], hello["rewardComponents"])

    def _call(self, req: dict) -> dict:
        assert self.proc.stdin and self.proc.stdout
        self.proc.stdin.write(json.dumps(req) + "\n")
        self.proc.stdin.flush()
        while True:
            line = self.proc.stdout.readline()
            if not line:
                raise RuntimeError("worker died: " + (self.proc.stderr.read() if self.proc.stderr else ""))
            # Defense in depth: the worker reserves stdout for the protocol,
            # but skip any stray non-JSON line rather than dying on it.
            try:
                resp = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not resp.get("ok"):
                raise RuntimeError(f"worker error: {resp.get('error')}")
            return resp

    def reset(self, seed: int, agents: int, bots: int = 0, set_=None, tune=None, decision_ticks=None) -> list:
        req = {"cmd": "reset", "seed": seed, "agents": agents, "bots": bots}
        if set_:
            req["set"] = set_
        if tune:
            req["tune"] = tune
        if decision_ticks:
            req["decisionTicks"] = decision_ticks
        return self._call(req)["obs"]

    def step(self, actions: list) -> tuple[list, list, bool, dict]:
        r = self._call({"cmd": "step", "actions": actions})
        info = {"placements": r["placements"]} if "placements" in r else {}
        return r["obs"], r["rewards"], r["done"], info

    def close(self) -> None:
        try:
            self._call({"cmd": "close"})
        except Exception:
            pass
        self.proc.terminate()


class VecHullcracker:
    """N independent workers, stepped in lockstep. Workers that finish an
    episode are auto-reset with a fresh seed (seed_stream keeps them unique)."""

    def __init__(self, n_workers: int, agents: int, bots: int = 0,
                 set_=None, decision_ticks=None) -> None:
        self.workers = [Worker() for _ in range(n_workers)]
        self.agents = agents
        self.bots = bots
        self.set_ = set_
        self.decision_ticks = decision_ticks
        self.seed_stream = 0
        self.spec = self.workers[0].spec

    def _next_seed(self) -> int:
        self.seed_stream += 1
        return (self.seed_stream * 2654435761) & 0xFFFFFFFF

    def reset(self, seeds=None) -> list:
        return [
            w.reset(seeds[i] if seeds else self._next_seed(), self.agents, self.bots,
                    set_=self.set_, decision_ticks=self.decision_ticks)
            for i, w in enumerate(self.workers)
        ]

    def step(self, actions: list):
        """actions: [worker][agent][7] ints. Auto-resets finished workers; the
        post-reset obs replaces the terminal obs (standard vec-env semantics),
        with the terminal info kept in infos[i]."""
        obs_out, rew_out, done_out, info_out = [], [], [], []
        for w, acts in zip(self.workers, actions):
            obs, rews, done, info = w.step(acts)
            if done:
                info["terminal"] = True
                obs = w.reset(self._next_seed(), self.agents, self.bots,
                              set_=self.set_, decision_ticks=self.decision_ticks)
            obs_out.append(obs)
            rew_out.append(rews)
            done_out.append(done)
            info_out.append(info)
        return obs_out, rew_out, done_out, info_out

    def close(self) -> None:
        for w in self.workers:
            w.close()

"""End-to-end bridge smoke: one worker, random policy, one short match.

Proves the whole chain — worker spawn, hello contract, reset, featurized
observations, action decoding, reward components, done + placements — with a
zone override that compresses the match to a few minutes of sim. No torch, no
training; safe to run anywhere `npm ci` has run.

    python3 rl/smoke.py
"""
import random
import sys
import time

from env_client import Worker


def main() -> int:
    t0 = time.time()
    w = Worker()
    spec = w.spec
    print(f"hello: featureDim={spec.feature_dim} v{spec.feature_version} "
          f"rewards={spec.reward_components}")
    bins = [spec.action_bins[k] for k in ("rudder", "throttle", "fire", "bearing", "range", "slot", "boost")]
    agents = 6
    obs = w.reset(seed=7, agents=agents, bots=4, set_={"zone.beatMs": 4000})
    assert len(obs) == agents and len(obs[0]) == spec.feature_dim, "obs shape"

    rng = random.Random(7)
    steps = 0
    totals = [0.0] * len(spec.reward_components)
    done = False
    info = {}
    while not done and steps < 5000:
        actions = [[rng.randrange(b) for b in bins] for _ in range(agents)]
        obs, rewards, done, info = w.step(actions)
        for row in rewards:
            for i, v in enumerate(row):
                totals[i] += v
        steps += 1
    w.close()

    dt = time.time() - t0
    print(f"steps={steps} done={done} placements={info.get('placements')}")
    print(f"reward component totals: {dict(zip(spec.reward_components, [round(t, 1) for t in totals]))}")
    print(f"wall={dt:.1f}s ({steps / dt:.0f} decisions/s incl. spawn)")
    if not done:
        print("FAIL: match did not finish inside the step budget", file=sys.stderr)
        return 1
    print("SMOKE OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

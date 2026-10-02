// THE PRIVATE-LOBBY DOORS (cycle 167, Eric rulings 2026-10-02) — the controller
// between the home's CREATE / JOIN presses, the two modals and net/lobby.ts.
// main.ts supplies the five port-side seams (`PrivateLobbyDeps`) and nothing
// else; the flow lives here so main.ts only wires.
//
//   CREATE → (session lock) → CONNECTING… → the lobby modal on the first view.
//   JOIN   → the join-code modal → (session lock on JOIN) → resolve + joinById
//            → a refusal stays in the join modal; the first view REPLACES it
//            with the lobby modal (modals never stack).
//   Either → the seat closes the lobby modal and the arena welcome launches the
//            match through the queue door's own path; anything else ends back
//            in port with the doors live again.
//
// THE HOME'S DOORS ARE BUSY FOR AS LONG AS THE JOIN MODAL IS UP. Its backdrop
// blocks clicks, not the keyboard: Tab still reaches PLAY / SOLO VS AI / CREATE,
// and a Space there would deploy under the modal. (The lobby modal needs nothing
// extra — both doors already hold the home busy until `backToPort`.)
//
// ESC ON THE JOIN MODAL CANCELS AN IN-FLIGHT JOIN. The resolve + joinById cannot
// be recalled, so the attempt is marked cancelled: a lobby that arrives anyway
// is left at once, no lobby modal opens and no refusal is painted — the player
// already walked away. It still ends in `backToPort` like every other end.

import type { Connection } from '../net/connection.js';
import {
  createLobby,
  isLobbyRefusal,
  joinLobby,
  leaveLobby,
  sendBotFill,
  sendReady,
  sendSeed,
  sendStart,
  type LobbyDeploy,
  type LobbyHooks,
} from '../net/lobby.js';
import {
  hideJoinCodeModal,
  joinCodeModalVisible,
  setJoinCodePending,
  showJoinCodeFailure,
  showJoinCodeModal,
} from '../ui/joinCodeModal.js';
import {
  hideLobbyModal,
  lobbyModalVisible,
  showLobbyModal,
  updateLobbyModal,
  type LobbyActions,
} from '../ui/lobbyModal.js';
import type { HomeHandle } from '../ui/home.js';

export interface PrivateLobbyDeps {
  home: HomeHandle;
  /** The single-session lock; on refusal it paints + un-busies the home itself. */
  claimPort(): Promise<boolean>;
  /** The lobby socket is up — the status line goes back to the server register. */
  serverReady(): void;
  /** The lobby ended without a match: release the lock, un-busy, resume the port. */
  backToPort(): void;
  /** The arena welcome landed — the queue door's own launch. */
  launch(conn: Connection): void;
}

const ACTIONS: LobbyActions = {
  onReady: sendReady,
  onSeed: sendSeed,
  onBotFill: sendBotFill,
  onStart: sendStart,
  onLeave: leaveLobby,
};

function reportError(deps: PrivateLobbyDeps, reason: string): void {
  hideLobbyModal();
  if (isLobbyRefusal(reason) && joinCodeModalVisible()) {
    showJoinCodeFailure(reason);
    return;
  }
  hideJoinCodeModal();
  deps.home.setStatus(reason, 'denied');
}

export function lobbyHooks(deps: PrivateLobbyDeps): LobbyHooks {
  return {
    onLobby: (view) => {
      if (!lobbyModalVisible()) {
        hideJoinCodeModal();
        showLobbyModal(ACTIONS);
        deps.serverReady();
      }
      updateLobbyModal(view);
    },
    onSeat: () => hideLobbyModal(),
    onError: (reason) => reportError(deps, reason),
    onLeft: () => hideLobbyModal(),
  };
}

function finish(deps: PrivateLobbyDeps, conn: Connection | null): void {
  if (conn !== null) deps.launch(conn);
  else deps.backToPort();
  // A refusal leaves the join modal up for a retry: keep its doors held.
  if (conn === null && joinCodeModalVisible()) deps.home.setBusy(true);
}

/** One JOIN attempt's cancel latch (ESC on the join modal while it is in flight). */
interface JoinAttempt {
  cancelled: boolean;
}

/** The hooks for a JOIN attempt: once cancelled, a lobby is left on arrival and
 *  nothing is painted. */
function joinHooks(deps: PrivateLobbyDeps, attempt: JoinAttempt): LobbyHooks {
  const hooks = lobbyHooks(deps);
  return {
    ...hooks,
    onLobby: (view) => (attempt.cancelled ? leaveLobby() : hooks.onLobby(view)),
    onError: (reason) => {
      if (!attempt.cancelled) hooks.onError(reason);
    },
  };
}

/** CREATE. */
export async function createPrivateLobby(deps: PrivateLobbyDeps, deploy: LobbyDeploy): Promise<void> {
  deps.home.setBusy(true);
  if (!(await deps.claimPort())) return;
  deps.home.setStatus('CONNECTING…', 'info');
  finish(deps, await createLobby(deploy, lobbyHooks(deps)));
}

async function joinWithCode(
  deps: PrivateLobbyDeps,
  deploy: LobbyDeploy,
  code: string,
  attempt: JoinAttempt,
): Promise<void> {
  setJoinCodePending(true);
  deps.home.setBusy(true);
  if (!(await deps.claimPort())) {
    hideJoinCodeModal(); // the refusal is on the home's status line — let it show
    return;
  }
  if (attempt.cancelled) {
    deps.backToPort(); // ESC landed while the lock was being claimed
    return;
  }
  const conn = await joinLobby(code, deploy, joinHooks(deps, attempt));
  setJoinCodePending(false);
  finish(deps, conn);
}

/** JOIN: open the join-code modal (the doors held busy under it); the lobby
 *  starts on its JOIN. */
export function openJoinPrivateLobby(deps: PrivateLobbyDeps, deploy: LobbyDeploy): void {
  let inFlight: JoinAttempt | null = null;
  deps.home.setBusy(true);
  showJoinCodeModal({
    onSubmit: (code) => {
      const attempt: JoinAttempt = { cancelled: false };
      inFlight = attempt;
      void joinWithCode(deps, deploy, code, attempt).finally(() => {
        if (inFlight === attempt) inFlight = null;
      });
    },
    onClose: () => {
      // In flight: cancel it — its own end runs `backToPort`, which frees the
      // doors. Idle (fresh, or after a refusal): the doors are freed here.
      if (inFlight !== null) inFlight.cancelled = true;
      else deps.home.setBusy(false);
    },
  });
}

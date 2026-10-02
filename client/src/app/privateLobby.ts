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
}

/** CREATE. */
export async function createPrivateLobby(deps: PrivateLobbyDeps, deploy: LobbyDeploy): Promise<void> {
  deps.home.setBusy(true);
  if (!(await deps.claimPort())) return;
  deps.home.setStatus('CONNECTING…', 'info');
  finish(deps, await createLobby(deploy, lobbyHooks(deps)));
}

async function joinWithCode(deps: PrivateLobbyDeps, deploy: LobbyDeploy, code: string): Promise<void> {
  setJoinCodePending(true);
  deps.home.setBusy(true);
  if (!(await deps.claimPort())) {
    hideJoinCodeModal(); // the refusal is on the home's status line — let it show
    return;
  }
  const conn = await joinLobby(code, deploy, lobbyHooks(deps));
  setJoinCodePending(false);
  finish(deps, conn);
}

/** JOIN: open the join-code modal; the lobby starts on its JOIN. */
export function openJoinPrivateLobby(deps: PrivateLobbyDeps, deploy: LobbyDeploy): void {
  showJoinCodeModal({
    onSubmit: (code) => void joinWithCode(deps, deploy, code),
    onClose: () => undefined,
  });
}

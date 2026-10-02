// THE JOIN-CODE MODAL (cycle 167, Eric ruling 9) — the JOIN door's first step.
//
// Its whole copy is Eric's: `ENTER CODE`, `JOIN`, and one failure line that
// reads `NO SUCH LOBBY`, `LOBBY FULL` or `MATCH STARTED`. The field uppercases
// as typed and keeps A–Z only (ruling 5: six letters, case-insensitive); JOIN
// stays disabled until it holds six. A failure leaves the field as typed so the
// player can retry; ESC closes. It sits in the queue modal's slot (z 1150,
// transparent click-blocking backdrop) and is replaced by the lobby modal the
// moment the lobby answers — modals never stack.

import { isWellFormedCode, normalizeCode, type LobbyRefusal } from '../net/lobby.js';
import {
  bindModalKeys,
  makeLine,
  makeModalButton,
  makeModalInput,
  makeModalShell,
  paintSlot,
  setButtonEnabled,
} from './portModal.js';

const JOIN_MODAL_ID = 'join-code-modal';

export interface JoinCodeHandlers {
  /** JOIN (button or Enter) with a well-formed, normalized code. */
  onSubmit(code: string): void;
  /** ESC. The modal is already gone when this runs. */
  onClose(): void;
}

interface Mounted {
  overlay: HTMLElement;
  input: HTMLInputElement;
  join: HTMLButtonElement;
  failure: HTMLElement;
  pending: boolean;
  detachKeys: () => void;
}

let mounted: Mounted | null = null;

export function joinCodeModalVisible(): boolean {
  return mounted !== null;
}

function refreshJoin(m: Mounted): void {
  setButtonEnabled(m.join, !m.pending && isWellFormedCode(m.input.value));
}

function submit(m: Mounted, h: JoinCodeHandlers): void {
  if (m.pending || !isWellFormedCode(m.input.value)) return;
  h.onSubmit(m.input.value);
}

function makeInput(onEdit: () => void, onEnter: () => void): HTMLInputElement {
  const input = makeModalInput();
  input.addEventListener('input', () => {
    const next = normalizeCode(input.value);
    if (input.value !== next) input.value = next;
    onEdit();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.stopPropagation();
    onEnter();
  });
  return input;
}

/** Open the modal (replacing any previous one — never two). */
export function showJoinCodeModal(h: JoinCodeHandlers): void {
  hideJoinCodeModal();
  const { overlay, panel } = makeModalShell(JOIN_MODAL_ID);
  const heading = makeLine('label', 'var(--hc-phosphor)');
  heading.textContent = 'ENTER CODE';
  const failure = makeLine('hudMicro', 'var(--hc-denied)');
  const m: Mounted = {
    overlay,
    input: makeInput(
      () => {
        paintSlot(failure, '');
        refreshJoin(m);
      },
      () => submit(m, h),
    ),
    join: makeModalButton('JOIN', 'var(--hc-amber)', () => submit(m, h)),
    failure,
    pending: false,
    detachKeys: bindModalKeys(() => {
      hideJoinCodeModal();
      h.onClose();
    }),
  };
  paintSlot(failure, '');
  panel.append(heading, m.input, m.join, failure);
  document.body.appendChild(overlay);
  mounted = m;
  refreshJoin(m);
  m.input.focus();
}

/** JOIN is held disabled while a resolve/join is in the air. */
export function setJoinCodePending(pending: boolean): void {
  const m = mounted;
  if (m === null) return;
  m.pending = pending;
  refreshJoin(m);
}

/** Show a refusal; the field keeps what the player typed. */
export function showJoinCodeFailure(reason: LobbyRefusal): void {
  const m = mounted;
  if (m === null) return;
  paintSlot(m.failure, reason);
}

/** Close. Idempotent; the one teardown path. */
export function hideJoinCodeModal(): void {
  const m = mounted;
  mounted = null;
  if (m !== null) {
    m.detachKeys();
    m.overlay.remove();
  }
  document.getElementById(JOIN_MODAL_ID)?.remove();
}

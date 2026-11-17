import notice from '../../NOTICE?raw';
import { readStored, writeStored } from '../util/storage';
import { byId, setAttr } from './dom';
import { SHORTCUT_HELP } from './shortcuts';

const MODES = ['auto', 'light', 'dark'];
const PLINTHS = ['silver', 'black', 'champagne', 'walnut'];

interface CoachStep {
  title: string;
  text: string;
  target: string;
}

const COACH_STEPS: readonly CoachStep[] = [
  {
    title: 'Record a cassette',
    text: 'Use Add files or Add folder, or drop audio files anywhere on the page. They are laid onto a cassette as a mixtape, side A then side B. Your music stays on this device.',
    target: '#add-files',
  },
  {
    title: 'The transport keys',
    text: 'Play, stop, fast wind and pause work on the deck itself or on the keys below it. Press stop again to eject. Hold fast forward or rewind during play to cue or review.',
    target: '#play',
  },
  {
    title: 'Auto-reverse',
    text: 'At the end of side A the head turns over and side B plays. The Reverse mode switch decides whether it stops after side B or goes round and round; ◀▶ turns it by hand.',
    target: '#reverse',
  },
  {
    title: 'Tape, noise reduction, counter',
    text: 'Match the tape selector and noise reduction to the cassette, or hear what a mismatch does. The counter counts reel turns, not seconds, as a real one does.',
    target: '#counter',
  },
];

export interface Chrome {
  toggleFocusMode(): void;
  /** Handles Escape. Returns true when it closed or left something. */
  escape(): boolean;
  openShortcuts(): void;
}

/** Page chrome: page mode, finish, focus mode, help dialogs and the tutorial. */
/**
 * `onCoachStep` gets the tutorial's step index (−1 when it closes), so the camera can look at
 * what each step talks about.
 */
export function bindChrome(
  onThemeChange: () => void,
  onCoachStep?: (step: number) => void,
): Chrome {
  const root = document.documentElement;

  function bindSelect(
    id: string,
    key: string,
    allowed: string[],
    apply: (value: string) => void,
  ): void {
    const select = byId<HTMLSelectElement>(id);
    const stored = readStored(key);
    if (typeof stored === 'string' && allowed.includes(stored)) select.value = stored;
    const update = (): void => {
      apply(select.value);
      onThemeChange();
    };
    select.addEventListener('change', () => {
      writeStored(key, select.value);
      update();
    });
    update();
  }

  bindSelect('mode', 'mode', MODES, (mode) => {
    if (mode === 'auto') root.removeAttribute('data-mode');
    else root.dataset.mode = mode;
  });
  bindSelect('plinth', 'plinth', PLINTHS, (plinth) => {
    root.dataset.plinth = plinth;
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onThemeChange);

  const focusButton = byId<HTMLButtonElement>('focus-mode');
  let displaced: HTMLElement | null = null;
  function toggleFocusMode(): void {
    const active = document.activeElement as HTMLElement | null;
    const entering = document.body.classList.toggle('focus-mode');
    setAttr(focusButton, 'aria-pressed', String(entering));
    if (entering) {
      // Keep keyboard focus on something visible; remember where it was.
      displaced =
        active && active !== document.body && active.offsetParent === null ? active : null;
      if (displaced) focusButton.focus();
    } else if (displaced?.isConnected) {
      displaced.focus();
      displaced = null;
    }
  }
  focusButton.addEventListener('click', toggleFocusMode);

  const helpMenu = byId<HTMLDetailsElement>('help-menu');
  const shortcutsDialog = byId<HTMLDialogElement>('shortcuts-dialog');
  const creditsDialog = byId<HTMLDialogElement>('credits-dialog');
  const table = byId<HTMLTableSectionElement>('shortcuts-body');
  for (const [keys, description] of SHORTCUT_HELP) {
    const row = table.insertRow();
    const key = document.createElement('th');
    key.scope = 'row';
    key.textContent = keys;
    row.append(key);
    row.insertCell().textContent = description;
  }
  byId('credits-text').textContent = notice;

  function openDialog(dialog: HTMLDialogElement): void {
    helpMenu.open = false;
    if (!dialog.open) dialog.showModal();
  }
  byId('open-shortcuts').addEventListener('click', () => openDialog(shortcutsDialog));
  byId('open-credits').addEventListener('click', () => openDialog(creditsDialog));

  const coach = byId<HTMLDialogElement>('coach');
  const coachCount = byId<HTMLElement>('coach-count');
  const coachTitle = byId<HTMLElement>('coach-title');
  const coachText = byId<HTMLElement>('coach-text');
  const coachBack = byId<HTMLButtonElement>('coach-back');
  const coachNext = byId<HTMLButtonElement>('coach-next');
  let step = 0;

  function clearHighlight(): void {
    document.querySelector('.coach-target')?.classList.remove('coach-target');
  }

  function showStep(index: number): void {
    step = Math.max(0, Math.min(COACH_STEPS.length - 1, index));
    const current = COACH_STEPS[step];
    if (!current) return;
    coachCount.textContent = `Step ${step + 1} of ${COACH_STEPS.length}`;
    coachTitle.textContent = current.title;
    coachText.textContent = current.text;
    coachBack.disabled = step === 0;
    coachNext.textContent = step === COACH_STEPS.length - 1 ? 'Done' : 'Next';
    clearHighlight();
    const target = document.querySelector(current.target);
    target?.classList.add('coach-target');
    target?.scrollIntoView({ block: 'nearest' });
    onCoachStep?.(step);
  }

  function closeCoach(): void {
    if (!coach.open) return;
    coach.close();
    clearHighlight();
    writeStored('coachDone', true);
    onCoachStep?.(-1);
  }

  function openCoach(): void {
    helpMenu.open = false;
    if (!coach.open) coach.show();
    showStep(0);
  }

  coachBack.addEventListener('click', () => showStep(step - 1));
  coachNext.addEventListener('click', () => {
    if (step === COACH_STEPS.length - 1) closeCoach();
    else showStep(step + 1);
  });
  byId('coach-close').addEventListener('click', closeCoach);
  byId('open-coach').addEventListener('click', openCoach);
  if (readStored('coachDone') !== true) openCoach();

  return {
    toggleFocusMode,
    openShortcuts: () => openDialog(shortcutsDialog),
    escape(): boolean {
      if (coach.open) {
        closeCoach();
        return true;
      }
      if (helpMenu.open) {
        helpMenu.open = false;
        return true;
      }
      if (document.body.classList.contains('focus-mode')) {
        toggleFocusMode();
        return true;
      }
      return false;
    },
  };
}

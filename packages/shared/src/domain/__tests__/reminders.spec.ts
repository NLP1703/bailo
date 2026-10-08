import { describe, expect, it } from 'vitest';
import {
  dueReminderStage,
  isEndOfAdvanceDay,
  isQuietHours,
  renderTemplate,
  stageForDaysPastDue,
  type SitePaliers,
} from '../reminders';
import { utcDate } from '../dates';

const allOn: SitePaliers = {
  reminderJm3: true,
  reminderJ0: true,
  reminderJp5: true,
  reminderJp15: true,
};

describe('paliers de relance (RG11)', () => {
  it('associe le bon palier au décalage', () => {
    expect(stageForDaysPastDue(-3)).toBe('J_MINUS_3');
    expect(stageForDaysPastDue(0)).toBe('J_0');
    expect(stageForDaysPastDue(5)).toBe('J_PLUS_5');
    expect(stageForDaysPastDue(15)).toBe('J_PLUS_15');
    expect(stageForDaysPastDue(2)).toBeNull();
  });

  it('J-3 pour une échéance due dans 3 jours', () => {
    expect(
      dueReminderStage({
        dueDate: utcDate(2026, 9, 10),
        today: utcDate(2026, 9, 7),
        remaining: 25000,
        cancelled: false,
        paliers: allOn,
      }),
    ).toBe('J_MINUS_3');
  });

  it('rien pour une échéance payée (RG12)', () => {
    expect(
      dueReminderStage({
        dueDate: utcDate(2026, 9, 10),
        today: utcDate(2026, 9, 10),
        remaining: 0,
        cancelled: false,
        paliers: allOn,
      }),
    ).toBeNull();
  });

  it('rien si le palier est désactivé sur le site (RG11)', () => {
    expect(
      dueReminderStage({
        dueDate: utcDate(2026, 9, 10),
        today: utcDate(2026, 9, 10),
        remaining: 25000,
        cancelled: false,
        paliers: { ...allOn, reminderJ0: false },
      }),
    ).toBeNull();
  });
});

describe('fenêtre d’envoi (RG12)', () => {
  it('silence entre 21 h et 7 h', () => {
    expect(isQuietHours(22)).toBe(true);
    expect(isQuietHours(6)).toBe(true);
    expect(isQuietHours(7)).toBe(false);
    expect(isQuietHours(20)).toBe(false);
  });
});

describe('fin d’avance (RG13)', () => {
  it('rappel 30 jours avant la fin de couverture', () => {
    expect(isEndOfAdvanceDay(utcDate(2026, 10, 31), utcDate(2026, 10, 1))).toBe(true);
    expect(isEndOfAdvanceDay(utcDate(2026, 10, 31), utcDate(2026, 10, 2))).toBe(false);
  });
});

describe('renderTemplate (F7.2)', () => {
  it('substitue les variables connues et laisse les inconnues', () => {
    expect(
      renderTemplate('Bonjour {nom}, chambre {chambre} : {montant} dû le {date}.', {
        nom: 'Paul',
        chambre: 'A12',
        montant: '25 000 FCFA',
        date: '05/09/2026',
      }),
    ).toBe('Bonjour Paul, chambre A12 : 25 000 FCFA dû le 05/09/2026.');
    expect(renderTemplate('Salut {inconnu}', {})).toBe('Salut {inconnu}');
  });
});

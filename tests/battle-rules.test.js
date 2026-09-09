import test from 'node:test';
import assert from 'node:assert/strict';
import { cards } from '../src/data/cards.js';
import { getAbilityBoosts, getAbilityBoost, getEffectiveStatValue, resolveStatContest } from '../src/game/battleRules.js';
import { rarityEffect, readVisualSettings } from '../src/ui/worlds.js';

test('matching abilities can turn a base-stat loss into a win', () => {
  const brooklyn = cards.find(card => card.id === 'crypto-brooklyn');
  const opponent = { stats: { speed: 95 }, ability: { description: '' } };
  assert.deepEqual(resolveStatContest(brooklyn, opponent, 'Speed'), {
    selectedStat: 'speed', playerBase: 87, playerBoost: 15, playerValue: 102,
    opponentBase: 95, opponentBoost: 0, opponentValue: 95, winner: 'player',
  });
  assert.equal(getAbilityBoost(brooklyn, 'luck'), 0);
  assert.equal(getEffectiveStatValue(brooklyn, 'luck'), brooklyn.stats.luck);
  assert.equal(brooklyn.stats.speed, 87, 'boosts must not permanently mutate base stats');
});

test('both combatants receive their selected-stat bonus, including ties', () => {
  const player = { stats: { defence: 80 }, ability: { description: 'Gain +20 Defense.' } };
  const opponent = { stats: { defence: 85 }, ability_description: 'Defence by +15.' };
  const result = resolveStatContest(player, opponent, 'defense');
  assert.equal(result.playerValue, 100);
  assert.equal(result.opponentValue, 100);
  assert.equal(result.winner, 'draw');
  assert.equal(result.selectedStat, 'defence');
});

test('catalogue ability grammar and remote structured bonuses produce finite totals', () => {
  const bandit = cards.find(card => card.id === 'crypto-bandit');
  assert.deepEqual(getAbilityBoosts(bandit), { speed: 25 });
  const limebyte = cards.find(card => card.name === 'Limebyte');
  assert.deepEqual(getAbilityBoosts(limebyte), { speed: 18, defence: 14 });
  for (const card of cards) {
    const boosts = getAbilityBoosts(card);
    assert.ok(Object.keys(boosts).length, `${card.id} must have a combat bonus`);
    for (const stat of ['power', 'speed', 'intelligence', 'defence', 'luck']) {
      assert.ok(Number.isFinite(getEffectiveStatValue(card, stat)), `${card.id}: ${stat}`);
    }
  }
  assert.equal(getEffectiveStatValue({ stats: { speed: 70 }, ability_boosts: { speed: 18 } }, 'speed'), 88);
  assert.equal(getEffectiveStatValue({ stats: { power: 70 }, abilityBoosts: { power: 20 } }, 'power'), 90);
});

test('rarity effects grow for prestige pulls and tolerate unknown values', () => {
  assert.ok(rarityEffect('LEGENDARY').intensity > rarityEffect('Rare').intensity);
  assert.ok(rarityEffect('Mythic').intensity >= rarityEffect('Legendary').intensity);
  assert.equal(rarityEffect('future-rarity'), rarityEffect('common'));
  assert.equal(rarityEffect(null), rarityEffect('common'));
});

test('graphics settings recover from invalid, inaccessible, and old saved values', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    for (const value of ['{broken', 'null', '{}', '{"world":"unknown","quality":"ultra"}']) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => value } });
      assert.deepEqual(readVisualSettings(), { world: 'nebula', quality: 'auto' });
    }
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => '{"world":"coast","quality":"eco"}' } });
    assert.deepEqual(readVisualSettings(), { world: 'coast', quality: 'eco' });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('storage denied'); } });
    assert.deepEqual(readVisualSettings(), { world: 'nebula', quality: 'auto' });
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

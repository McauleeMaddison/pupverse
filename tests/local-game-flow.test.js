import test from 'node:test';
import assert from 'node:assert/strict';
import { cards } from '../src/data/cards.js';

test('a resolved ability round rewards once and a pack saves all three pulls once', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const saved = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
  });
  try {
    const { gameState, startComputerBattle, chooseBattleStat, startPackOpening, finishPackOpening } = await import('../src/game/state.js');
    startComputerBattle();
    gameState.playerCard = cards.find(card => card.id === 'crypto-brooklyn');
    gameState.computerCard = { id: 'test-opponent', name: 'Test opponent', stats: { speed: 95 } };
    const initialCoins = gameState.coins;
    chooseBattleStat('speed');
    assert.equal(gameState.winner, 'player');
    assert.equal(gameState.roundResult.playerValue, 102);
    assert.equal(gameState.coins, initialCoins + 5);
    assert.equal(gameState.totalBattles, 1);
    chooseBattleStat('speed');
    assert.equal(gameState.coins, initialCoins + 5, 'double taps cannot award a second win');
    assert.equal(gameState.totalBattles, 1);

    assert.equal(startPackOpening('crypto'), true);
    assert.equal(startPackOpening('crypto'), false, 'only one opening can be active');
    finishPackOpening();
    assert.equal(gameState.collection.length, 3);
    assert.equal(gameState.lastOpenedPack.length, 3);
    assert.equal(gameState.totalPacksOpened, 1);
    assert.equal(gameState.coins, initialCoins);
    const persisted = JSON.parse(saved.get('pupverse-save-v3'));
    assert.equal(persisted.collection.length, 3, 'all pulls survive interruption during visual reveal');
    finishPackOpening();
    assert.equal(gameState.collection.length, 3);
    assert.equal(gameState.coins, initialCoins, 'repeat completion cannot charge twice');
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

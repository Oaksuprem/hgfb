import assert from 'node:assert/strict'
import test from 'node:test'
import * as xrpl from 'xrpl'
import { assetPriceHuman, assetPriceValue, oracleAssetCode, oracleUpdateTime } from '../src/lib/oracle.js'

test('a decimal quote becomes the scaled integer the oracle expects', () => {
  assert.equal(assetPriceValue('2.45', 6), 2450000)
  assert.equal(assetPriceHuman('2.45', 6), '2.45')
  assert.equal(assetPriceValue('0.5', 2), 50)
})

test('a scaled integer is sent as that integer, not as hex text', () => {
  assert.equal(assetPriceValue('6543210', 6), 6543210)
  assert.equal(typeof assetPriceValue('6543210', 6), 'number')
  assert.equal(assetPriceHuman('6543210', 6), '6.54321')
})

test('XRP and USD stay currency codes so the oracle transaction can be encoded', () => {
  assert.equal(oracleAssetCode('XRP'), 'XRP')
  assert.equal(oracleAssetCode('usd'), 'USD')
  assert.notEqual(oracleAssetCode('XRP'), '585250')

  const publisher = xrpl.Wallet.generate()
  const signed = publisher.sign({
    TransactionType: 'OracleSet',
    Account: publisher.address,
    OracleDocumentID: 1,
    Provider: '48474642',
    LastUpdateTime: 800000000,
    AssetClass: '63757272656E6379',
    PriceDataSeries: [{
      PriceData: {
        BaseAsset: oracleAssetCode('XRP'),
        QuoteAsset: oracleAssetCode('USD'),
        AssetPrice: assetPriceValue('2.45', 6),
        Scale: 6,
      },
    }],
    Fee: '12',
    Sequence: 1,
  })
  assert.match(signed.hash, /^[A-F0-9]{64}$/)
})

test('oracle update time is Unix time and moves past the previous update', () => {
  const now = 1_794_770_962
  assert.equal(oracleUpdateTime({ now, previous: 0, ledgerTime: now }), now)
  assert.equal(oracleUpdateTime({ now, previous: now, ledgerTime: now }), now + 1)
  assert.equal(oracleUpdateTime({ now, previous: now - 10, ledgerTime: now }), now)
  assert.throws(() => oracleUpdateTime({ now: 848085160, ledgerTime: now }), /Unix/)
  assert.throws(() => oracleUpdateTime({ now: now + 301, previous: 0, ledgerTime: now }), /five minutes/)
  assert.throws(() => oracleUpdateTime({ now, previous: now + 300, ledgerTime: now }), /five minutes/)
})

test('text that is not a plain number is rejected before it is treated as hex', () => {
  assert.throws(() => assetPriceValue('2.45 USD', 6), /number/)
  assert.throws(() => assetPriceValue('', 6), /number/)
})

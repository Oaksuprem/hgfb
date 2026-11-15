/**
 * OracleService — pure builders for XLS-47 price oracle operations.
 */
import * as xrpl from 'xrpl'
import { assetPriceValue, oracleAssetCode } from '../lib/oracle'

function toHex(s) {
  if (!s) return s
  if (/^[0-9A-Fa-f]+$/.test(s) && s.length % 2 === 0) return s
  return xrpl.convertStringToHex(s)
}

export function buildSetOracle({ account, oracleDocumentID, assetClass, provider, lastUpdateTime, priceDataSeries, uri }) {
  const tx = {
    TransactionType: 'OracleSet',
    Account: account,
    OracleDocumentID: oracleDocumentID,
    AssetClass: toHex(assetClass),
    Provider: toHex(provider),
    LastUpdateTime: lastUpdateTime,
    PriceDataSeries: (priceDataSeries ?? []).map(p => ({
      PriceData: {
        BaseAsset:  oracleAssetCode(p.baseAsset ?? p.BaseAsset),
        QuoteAsset: oracleAssetCode(p.quoteAsset ?? p.QuoteAsset),
        AssetPrice: assetPriceValue(p.assetPrice ?? p.AssetPrice, p.scale ?? p.Scale),
        Scale:      p.scale      ?? p.Scale,
      },
    })),
  }
  if (uri) tx.URI = toHex(uri)
  return tx
}

export function buildDeleteOracle({ account, oracleDocumentID }) {
  return { TransactionType: 'OracleDelete', Account: account, OracleDocumentID: oracleDocumentID }
}

export async function queryOracle(account, oracleDocumentID, client) {
  try {
    const r = await client.request({ command: 'ledger_entry', oracle: { account, oracle_document_id: oracleDocumentID }, ledger_index: 'validated' })
    return r.result.node ?? null
  } catch {
    return null
  }
}

/**
 * Documentation route handler
 */
export async function handleDocumentation(
  symbol,
  type,
  reqHasAlpacaHeaders,
  reqKeyId,
  reqSecretKey,
  alpacaRequest,
  getCryptoDetails,
) {
  let data = null;

  if (type === "crypto") {
    data = await getCryptoDetails(symbol);
  } else {
    try {
      const asset = await alpacaRequest(
        `/v2/assets/${symbol}`,
        "GET",
        reqHasAlpacaHeaders
          ? { __alpacaKeyId: reqKeyId, __alpacaSecretKey: reqSecretKey }
          : null,
        false,
      );
      data = {
        symbol: asset.symbol,
        name: asset.name,
        description: `Exchange: ${asset.exchange} | Status: ${asset.status}`,
        homepage: "",
        tradable: asset.tradable,
        marginable: asset.marginable,
        isStock: true,
      };
    } catch (e) {
      // Asset not found or error - return minimal data
      data = { symbol, description: "No details available", name: symbol };
    }
  }

  if (!data) {
    data = { symbol, description: "No details available", name: symbol };
  }

  return { success: true, data };
}

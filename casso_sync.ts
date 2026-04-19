export async function syncCassoTransactions(apiKey: string) {
  const res = await fetch("https://oauth.casso.vn/v2/transactions?limit=100&sort=DESC", {
    headers: { Authorization: \`Apikey \${apiKey}\` }
  });
  return await res.json();
}

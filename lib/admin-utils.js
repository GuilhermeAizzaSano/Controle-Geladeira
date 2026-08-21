function getUsersEligibleForBulkReset(rows) {
  const seen = new Set();
  const userIds = [];

  for (const row of rows || []) {
    const id = Number.parseInt(row?.id, 10);
    const totalGasto = Number(row?.total_gasto);

    if (!Number.isInteger(id) || id <= 0) continue;
    if (!Number.isFinite(totalGasto) || totalGasto <= 0) continue;
    if (seen.has(id)) continue;

    seen.add(id);
    userIds.push(id);
  }

  return userIds;
}

module.exports = {
  getUsersEligibleForBulkReset,
};

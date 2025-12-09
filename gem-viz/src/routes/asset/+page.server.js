export const prerender = true;

export async function load() {
  // Only runs at build time because prerender = true
  const motherduck = (await import('$lib/motherduck-node')).default;

  try {
    // Query the catalog to find actual data tables (skip metadata sheets like "About")
    const catalogResult = await motherduck.query(`
      SELECT schema_name, table_name, row_count
      FROM catalog
      WHERE LOWER(table_name) NOT IN ('about', 'metadata', 'readme')
        AND row_count > 100
      ORDER BY row_count DESC
      LIMIT 1
    `);

    if (!catalogResult.success || catalogResult.data.length === 0) {
      return { assets: [], tableName: null };
    }

    const { schema_name, table_name } = catalogResult.data[0];
    const fullTableName = `${schema_name}.${table_name}`;

    // Get schema to find columns
    const schemaResult = await motherduck.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = '${schema_name}'
        AND table_name = '${table_name}'
      ORDER BY ordinal_position
    `);

    const columns = schemaResult.data.map(c => c.column_name);

    // Detect columns (mirror asset detail prerender logic)
    const countryCol = columns.find(c => c.toLowerCase() === 'country' || c.toLowerCase() === 'country/area');
    const ownerCol = columns.find(c => c.toLowerCase() === 'owner');

    const ownerIdCol = columns.find(c => {
      const lower = c.toLowerCase();
      return lower.includes('owner') && lower.includes('id');
    });

    const unitIdCol = columns.find(c => c.toLowerCase() === 'gem unit id');

    const useCompositeId = Boolean(ownerIdCol && unitIdCol);

    // Find the best ID column (fallback)
    const idCol = columns.find(c => {
      const lower = c.toLowerCase();
      return lower === 'id' || lower === 'wiki page' || lower === 'project id' || lower.includes('_id');
    }) || columns[0];

    // Better name column detection
    const nameCol = columns.find(c => {
      const lower = c.toLowerCase();
      return lower === 'mine' || lower === 'plant' || lower === 'project' || lower === 'facility' ||
             lower === 'mine name' || lower === 'plant name' || lower === 'project name';
    });

    const statusCol = columns.find(c => c.toLowerCase() === 'status');

    // Select just the columns we need for the list view
    const columnsToSelect = [idCol];
    if (nameCol) columnsToSelect.push(nameCol);
    if (statusCol) columnsToSelect.push(statusCol);
    if (ownerCol) columnsToSelect.push(ownerCol);
    if (countryCol) columnsToSelect.push(countryCol);
    if (ownerIdCol) columnsToSelect.push(ownerIdCol);
    if (unitIdCol) columnsToSelect.push(unitIdCol);

    // Query with just the columns we need
    const result = await motherduck.query(`
      SELECT ${columnsToSelect.map(c => `"${c}"`).join(', ')}
      FROM ${fullTableName}
      LIMIT 10000
    `);

    if (!result.success) {
      console.error('Query failed:', result.error);
      return { assets: [], tableName: fullTableName };
    }

    return {
      assets: result.data,
      tableName: fullTableName,
      idCol,
      nameCol,
      statusCol,
      ownerCol,
      countryCol,
      ownerIdCol,
      unitIdCol,
      useCompositeId
    };

  } catch (error) {
    console.error('Load error:', error);
    return {
      assets: [],
      tableName: null,
      error: error.message
    };
  }
}

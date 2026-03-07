/**
 * Packing List utility functions.
 * Extracted from the PL route for testability.
 */

/**
 * Extract product name from a BOL item description by removing packaging prefixes.
 * e.g. "1 FLEXI TANK Base Oil Group II 600N" -> "Base Oil Group II 600N"
 */
export function extractProductName(description: string): string {
  if (!description) return '';

  const cleanedDesc = description
    // Remove quantity + packaging type patterns like "1 FLEXI TANK", "10 IBC", "20 DRUMS", "5 PAILS"
    .replace(/^\d+\s+(?:FLEXI\s+TANK|FLEXITANK|FLEXI-TANK|IBC|DRUM|DRUMS|PAIL|PAILS|BARREL|BARRELS|CONTAINER|BULK|TOTE|TOTES)s?\s+/i, '')
    // Remove standalone packaging type patterns
    .replace(/^(?:FLEXI\s+TANK|FLEXITANK|FLEXI-TANK|IBC|DRUM|DRUMS|PAIL|PAILS|BARREL|BARRELS|CONTAINER|BULK|TOTE|TOTES)\s+/i, '')
    // Strip any remaining numeric prefixes that might be part of packaging
    .replace(/^\d+\s+/, '')
    .trim();

  return cleanedDesc;
}

/**
 * Extract packaging type and quantity from a BOL item description.
 * e.g. "1 FLEXI TANK ..." -> { packagingType: 'Flexitank', packagingQty: 1 }
 */
export function extractPackagingType(description: string): { packagingType: string; packagingQty: number } {
  if (!description) return { packagingType: '', packagingQty: 1 };

  const packagingMatch = description.match(
    /^(\d+)\s+(?:(FLEXI\s+TANK|FLEXITANK|FLEXI-TANK|IBC|DRUM|DRUMS|PAIL|PAILS|CONTAINER|BULK|TOTE)s?)/i
  );

  if (packagingMatch) {
    const qty = parseInt(packagingMatch[1], 10) || 1;
    let type = packagingMatch[2].trim();

    if (/FLEXI\s+TANK|FLEXITANK|FLEXI-TANK/i.test(type)) {
      type = 'Flexitank';
    } else if (/IBC/i.test(type)) {
      type = 'IBC';
    } else if (/DRUM|DRUMS/i.test(type)) {
      type = 'Drum';
    } else if (/PAIL|PAILS/i.test(type)) {
      type = 'Pail';
    } else if (/CONTAINER/i.test(type)) {
      type = 'Container';
    } else if (/BULK/i.test(type)) {
      type = 'Bulk';
    } else if (/TOTE/i.test(type)) {
      type = 'Tote';
    }

    return { packagingType: type, packagingQty: qty };
  }

  // Check for packaging terms anywhere in the description (not just at start)
  const anywhereMatch = description.match(
    /(\d+)\s*[xX]?\s*(?:(FLEXI[\s-]?TANK|ISO[\s-]?TANK|IBC|DRUM|DRUMS|PAIL|PAILS|TOTE|TOTES|BARREL|BARRELS|CONTAINER|CONTAINERS|BULK)s?)/i
  );

  if (anywhereMatch) {
    const qty = parseInt(anywhereMatch[1], 10) || 1;
    const raw = anywhereMatch[2].trim();

    if (/FLEXI/i.test(raw)) return { packagingType: 'Flexitank', packagingQty: qty };
    if (/ISO/i.test(raw)) return { packagingType: 'Iso Tank', packagingQty: qty };
    if (/IBC/i.test(raw)) return { packagingType: 'IBC', packagingQty: qty };
    if (/DRUM/i.test(raw)) return { packagingType: 'Drum', packagingQty: qty };
    if (/PAIL/i.test(raw)) return { packagingType: 'Pail', packagingQty: qty };
    if (/TOTE/i.test(raw)) return { packagingType: 'Tote', packagingQty: qty };
    if (/BARREL/i.test(raw)) return { packagingType: 'Barrel', packagingQty: qty };
    if (/CONTAINER/i.test(raw)) return { packagingType: 'Container', packagingQty: qty };
    if (/BULK/i.test(raw)) return { packagingType: 'Bulk', packagingQty: qty };
  }

  return { packagingType: '', packagingQty: 1 };
}

/**
 * Derive items array from extractedData.containers (Claude's raw output).
 * Used as a fallback when bolDocument.items was never populated.
 *
 * Supports two formats:
 * - New: container.lineItems[] with packaging/product/volume/weight per line
 * - Legacy: container.product.name + container.product.description + container.quantity
 */
export function itemsFromExtractedContainers(containers: any[] | undefined): BolItem[] {
  if (!containers || containers.length === 0) return [];

  const items: BolItem[] = [];
  let itemNum = 0;

  for (const c of containers) {
    const containerNumber = c.containerNumber || '';
    const seal = c.sealNumber || '';

    // New format: lineItems array (one entry per product/packaging in this container)
    if (Array.isArray(c.lineItems) && c.lineItems.length > 0) {
      for (const li of c.lineItems) {
        itemNum++;
        items.push({
          itemNumber: itemNum,
          containerNumber,
          seal,
          description: li.product || '',
          product: li.product || '',
          packaging: li.packaging || '',
          packagingQuantity: typeof li.packagingQuantity === 'number' ? li.packagingQuantity : 1,
          quantity: {
            litros: typeof li.volume?.liters === 'number' ? li.volume.liters.toFixed(2) : '0',
            kg: typeof li.weight?.kg === 'number' ? li.weight.kg.toFixed(3) : '0',
          },
        });
      }
      continue;
    }

    // Legacy format: single product per container
    itemNum++;
    const productName = c.product?.name || '';
    const description = c.product?.description || c.description || '';
    // Only fall back to regex for legacy data that didn't have explicit packaging
    const { packagingType, packagingQty } = extractPackagingType(description);

    items.push({
      itemNumber: itemNum,
      containerNumber,
      seal,
      description,
      product: productName || description,
      packaging: packagingType,
      packagingQuantity: packagingQty,
      quantity: {
        litros: typeof c.quantity?.volume?.liters === 'number'
          ? c.quantity.volume.liters.toFixed(2)
          : '0',
        kg: typeof c.quantity?.weight?.kg === 'number'
          ? c.quantity.weight.kg.toFixed(3)
          : '0',
      },
    });
  }

  return items;
}

/**
 * Represents a single container group for the packing list table.
 */
export interface ContainerRow {
  containerNumber: string;
  sealNumber: string;
  packagingType: string;
  productDescription: string;
  packagingQty: number;
  quantityLiters: string;
  quantityKg: string;
}

/**
 * Item shape from the Document model items array.
 */
export interface BolItem {
  itemNumber?: number;
  containerNumber?: string;
  seal?: string;
  description?: string;
  product?: string;
  packaging?: string;
  packagingQuantity?: number;
  quantity?: {
    litros?: string;
    kg?: string;
  };
}

/**
 * Build container rows for the packing list table from BOL items.
 * Groups items by container and aggregates packaging/quantity data.
 * Each container gets one row per unique packaging+product combination.
 */
export function buildContainerRows(items: BolItem[]): ContainerRow[] {
  if (!items || items.length === 0) return [];

  // Group items by container
  const containerGroups = new Map<string, BolItem[]>();

  for (const item of items) {
    const containerNum = item.containerNumber || '';
    if (!containerGroups.has(containerNum)) {
      containerGroups.set(containerNum, []);
    }
    containerGroups.get(containerNum)!.push(item);
  }

  const rows: ContainerRow[] = [];

  for (const [containerNum, containerItems] of containerGroups.entries()) {
    // Get the seal number from the first item in the container
    const sealNumber = containerItems[0]?.seal || '';

    // Group by packaging type + product
    const packagingGroups = new Map<
      string,
      {
        packagingType: string;
        productDesc: string;
        packagingQty: number;
        totalLiters: number;
        totalKg: number;
      }
    >();

    for (const item of containerItems) {
      const productDesc = item.product || extractProductName(item.description || '') || item.description || '';
      let packaging = item.packaging || '';
      let packagingQty = typeof item.packagingQuantity === 'number' ? item.packagingQuantity : 1;

      // If no explicit packaging, try to extract from description
      if (!packaging && item.description) {
        const extracted = extractPackagingType(item.description);
        packaging = extracted.packagingType || '';
        packagingQty = extracted.packagingQty;
      }

      const packagingKey = `${packaging}:${productDesc}`;

      if (!packagingGroups.has(packagingKey)) {
        packagingGroups.set(packagingKey, {
          packagingType: packaging,
          productDesc,
          packagingQty: 0,
          totalLiters: 0,
          totalKg: 0,
        });
      }

      const group = packagingGroups.get(packagingKey)!;
      group.packagingQty += packagingQty;

      // Parse and accumulate quantities
      if (item.quantity) {
        const liters = parseFloat((item.quantity.litros || '0').replace(/,/g, ''));
        const kg = parseFloat((item.quantity.kg || '0').replace(/,/g, ''));
        if (!isNaN(liters)) group.totalLiters += liters;
        if (!isNaN(kg)) group.totalKg += kg;
      }
    }

    let isFirst = true;
    for (const [, packageInfo] of packagingGroups.entries()) {
      rows.push({
        containerNumber: isFirst ? containerNum : '',
        sealNumber: isFirst ? sealNumber : '',
        packagingType: packageInfo.packagingType,
        productDescription: packageInfo.productDesc,
        packagingQty: packageInfo.packagingQty,
        quantityLiters: packageInfo.totalLiters > 0
          ? packageInfo.totalLiters.toLocaleString('en-US', { maximumFractionDigits: 0 })
          : '',
        quantityKg: packageInfo.totalKg > 0
          ? packageInfo.totalKg.toLocaleString('en-US', { maximumFractionDigits: 2 })
          : '',
      });
      isFirst = false;
    }
  }

  return rows;
}

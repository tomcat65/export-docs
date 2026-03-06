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
    // Remove quantity + packaging type patterns like "1 FLEXI TANK" or "10 IBC"
    .replace(/^\d+\s+(?:FLEXI\s+TANK|FLEXITANK|FLEXI-TANK|IBC|DRUM|DRUMS|CONTAINER|BULK|TOTE)s?\s+/i, '')
    // Remove standalone packaging type patterns
    .replace(/^FLEXI\s+TANK\s+|FLEXITANK\s+|FLEXI-TANK\s+|IBC\s+|DRUM\s+|DRUMS\s+|CONTAINER\s+|BULK\s+|TOTE\s+/i, '')
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
  if (!description) return { packagingType: 'Flexitank', packagingQty: 1 };

  const packagingMatch = description.match(
    /^(\d+)\s+(?:(FLEXI\s+TANK|FLEXITANK|FLEXI-TANK|IBC|DRUM|DRUMS|CONTAINER|BULK|TOTE)s?)/i
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
    } else if (/CONTAINER/i.test(type)) {
      type = 'Container';
    } else if (/BULK/i.test(type)) {
      type = 'Bulk';
    } else if (/TOTE/i.test(type)) {
      type = 'Tote';
    }

    return { packagingType: type, packagingQty: qty };
  }

  return { packagingType: 'Flexitank', packagingQty: 1 };
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
      const packaging = item.packaging || 'Flexitank';
      let packagingQty = item.packagingQuantity || 1;

      // If no explicit packaging, try to extract from description
      if (!item.packaging && item.description) {
        const extracted = extractPackagingType(item.description);
        if (packaging === 'Flexitank') {
          packagingQty = extracted.packagingQty;
        }
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

// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as path from 'path';

export interface BlockAttributes {
  number: number;
  compute?: string;
  async: boolean;
  disabled: boolean;
}

export interface ParsedBlock {
  type: 'xml' | 'json';
  attributes: BlockAttributes;
  fullMatch: string; // The text completo del blocco, inclusi i tag
  content: string;   // Il contenuto interno del blocco
  filePath: string;
  startLine: number; // 1-based line number
  startIndex: number; // 0-based character index of block start in file content
}

// Regex for XML-style Taylored blocks
// Catches:
// 1. numero (required)
// 2. attributesString (all other attributes)
// 3. content (inner content of the block)
const XML_BLOCK_REGEX = /[^\n]*?<taylored\s+number="(\d+)"([^>]*)>([\s\S]*?)[^\n]*?<\/taylored>/g;

// Regex for JSON-style Taylored blocks
// Approximation: Searches for a JSON object structure that contains "taylored": number
// This is complex because JSON can be formatted in many ways. This regex tries to be
// flexible but might need refinement for deeply nested or unusually formatted JSON.
// Catches:
// 1. fullMatch (the entire JSON structure that seems to be a taylored block, could be the value of a key or an object in an array)
// 2. numero (the taylored block number)
// It assumes the "taylored": number part is reasonably close to the "content" and other attributes.
const JSON_BLOCK_REGEX = /(?:"[^"]+"\s*:\s*)?({[^{}]*?"taylored"\s*:\s*(\d+)[^}]*?})/g;


export class BlockParser {
  /**
   * Parses the content of a file to find all Taylored blocks (both XML and JSON).
   * @param fileContent The string content of the file.
   * @param filePath The path to the file, used for populating ParsedBlock.
   * @returns An array of ParsedBlock objects, sorted by their appearance order in the file.
   */
  public parse(fileContent: string, filePath: string): ParsedBlock[] {
    const allMatches: ParsedBlock[] = [];

    // Parse XML blocks
    let xmlMatch;
    while ((xmlMatch = XML_BLOCK_REGEX.exec(fileContent)) !== null) {
      const fullMatch = xmlMatch[0];
      const numeroStr = xmlMatch[1];
      const attributesString = xmlMatch[2];
      const content = xmlMatch[3];
      const startIndex = xmlMatch.index;

      const numero = parseInt(numeroStr, 10);
      if (isNaN(numero)) {
        console.warn(`Warning: Found XML taylored block with invalid number '${numeroStr}' in ${filePath}. Skipping.`);
        continue;
      }

      const computeMatch = attributesString.match(/compute=["']([^"']*)["']/);
      const compute = computeMatch ? computeMatch[1] : undefined;

      const asyncMatch = attributesString.match(/async=["'](true|false)["']/);
      const async = asyncMatch ? asyncMatch[1] === 'true' : false;

      const disabledMatch = attributesString.match(/disabled=["'](true|false)["']/);
      const disabled = disabledMatch ? disabledMatch[1] === 'true' : false;

      if (disabled) {
          // As per plan, ParsedBlock objects are created even for disabled blocks,
          // the caller (automatic-handler) will check the disabled flag.
      }

      const contentUpToMatch = fileContent.substring(0, startIndex);
      const startLine = contentUpToMatch.split('\n').length;

      allMatches.push({
        type: 'xml',
        attributes: { number: numero, compute, async, disabled },
        fullMatch,
        content: content.trim(), // Trim content as per original handler logic for scripts
        filePath,
        startLine,
        startIndex,
      });
    }

    // Parse JSON blocks
    let jsonMatch;
    while ((jsonMatch = JSON_BLOCK_REGEX.exec(fileContent)) !== null) {
      const fullMatch = jsonMatch[0]; // This is the full matched string, e.g., "key": { ... } or just { ... }
      const jsonBlockText = jsonMatch[1]; // This is the actual JSON object part, e.g., { ... }
      const numeroStr = jsonMatch[2];
      const startIndex = jsonMatch.index;

      const numero = parseInt(numeroStr, 10);
      if (isNaN(numero)) {
        console.warn(`Warning: Found JSON taylored block with invalid number '${numeroStr}' in ${filePath}. Skipping.`);
        continue;
      }

      try {
        const parsedJson = JSON.parse(jsonBlockText);

        if (typeof parsedJson.content !== 'string') {
          console.warn(`Warning: JSON taylored block ${numero} in ${filePath} has invalid or missing 'content' (must be a string). Skipping.`);
          continue;
        }
        const content = parsedJson.content; // Do not trim here, let consumer decide based on compute.
        const compute = typeof parsedJson.compute === 'string' ? parsedJson.compute : undefined;
        const async = parsedJson.async === true; // Ensure boolean
        const disabled = parsedJson.disabled === true; // Ensure boolean

        if (disabled) {
            // As per plan, ParsedBlock objects are created even for disabled blocks.
        }

        const contentUpToMatch = fileContent.substring(0, startIndex);
        const startLine = contentUpToMatch.split('\n').length;

        allMatches.push({
          type: 'json',
          attributes: { number: numero, compute, async, disabled },
          fullMatch, // fullMatch here is what the regex captured, which might include a key.
                       // The original handler replaced `scriptContentWithTags` which was also the full regex match.
          content: content, // Content from JSON "content" property
          filePath,
          startLine,
          startIndex,
        });

      } catch (e: any) {
        console.warn(`Warning: Could not parse JSON for taylored block ${numero} in ${filePath}. Match: "${fullMatch.substring(0,100)}...". Error: ${e.message}. Skipping.`);
        continue;
      }
    }

    // Sort all found blocks by their start index in the file
    allMatches.sort((a, b) => a.startIndex - b.startIndex);

    return allMatches;
  }
}

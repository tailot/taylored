// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import { BlockParser, ParsedBlock, BlockAttributes } from './block-parser';

describe('BlockParser', () => {
  let parser: BlockParser;

  beforeEach(() => {
    parser = new BlockParser();
  });

  const mockFilePath = 'test/file.ts';

  it('should correctly parse a simple XML block', () => {
    const fileContent = `
      // Some preceding content
      // <taylored number="1">
      // This is block 1
      // </taylored>
      // Some trailing content
    `;
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    expect(block.type).toBe('xml');
    expect(block.attributes.number).toBe(1);
    expect(block.attributes.async).toBe(false);
    expect(block.attributes.disabled).toBe(false);
    expect(block.attributes.compute).toBeUndefined();
    expect(block.content).toBe('// This is block 1');
    expect(block.fullMatch).toContain('<taylored number="1">');
    expect(block.filePath).toBe(mockFilePath);
    expect(block.startLine).toBe(3);
  });

  it('should correctly parse an XML block with all attributes', () => {
    const fileContent = `
      /* <taylored number="2" compute="ts, //" async="true" disabled="false">
      export const x = 10;
      </taylored> */
    `;
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    expect(block.type).toBe('xml');
    expect(block.attributes.number).toBe(2);
    expect(block.attributes.compute).toBe('ts, //');
    expect(block.attributes.async).toBe(true);
    expect(block.attributes.disabled).toBe(false);
    expect(block.content).toBe('export const x = 10;');
    expect(block.startLine).toBe(2);
  });

  it('should correctly parse a disabled XML block', () => {
    const fileContent = `// <taylored number="3" disabled="true">content</taylored>`;
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(1); // Parser still returns it
    expect(blocks[0].attributes.disabled).toBe(true);
    expect(blocks[0].attributes.number).toBe(3);
  });

  it('should correctly parse a simple JSON block', () => {
    const fileContent = `
      const config = {
        "block1": {
          "taylored": 100,
          "content": "console.log('hello');"
        }
      };
    `;
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    expect(block.type).toBe('json');
    expect(block.attributes.number).toBe(100);
    expect(block.attributes.async).toBe(false); // Default
    expect(block.attributes.disabled).toBe(false); // Default
    expect(block.attributes.compute).toBeUndefined();
    expect(block.content).toBe("console.log('hello');");
    expect(block.fullMatch).toContain('"taylored": 100');
    expect(block.filePath).toBe(mockFilePath);
    expect(block.startLine).toBe(3); // The line where the JSON object starts
  });

  it('should correctly parse a JSON block with all attributes', () => {
    const fileContent = `
      {
        "taylored": 101,
        "compute": "js",
        "async": true,
        "disabled": false,
        "content": "let y = 20;"
      }
    `;
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    expect(block.type).toBe('json');
    expect(block.attributes.number).toBe(101);
    expect(block.attributes.compute).toBe('js');
    expect(block.attributes.async).toBe(true);
    expect(block.attributes.disabled).toBe(false);
    expect(block.content).toBe("let y = 20;");
    expect(block.startLine).toBe(2);
  });

  it('should correctly parse a disabled JSON block', () => {
    const fileContent = `{"taylored": 102, "disabled": true, "content": "test"}`;
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].attributes.disabled).toBe(true);
    expect(blocks[0].attributes.number).toBe(102);
  });

  it('should parse multiple blocks (XML and JSON) in correct order', () => {
    const fileContent = `
      // <taylored number="1">XML Block 1</taylored>
      const config = {
        "json_block_1": {
          "taylored": 100,
          "content": "JSON content 1"
        }
      };
      // <taylored number="2" async="true">XML Block 2</taylored>
      const anotherConfig = {
        "taylored": 101, "compute": "go", "content": "JSON content 2"
      }
    `;
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(4);

    expect(blocks[0].type).toBe('xml');
    expect(blocks[0].attributes.number).toBe(1);
    expect(blocks[0].startLine).toBe(2);

    expect(blocks[1].type).toBe('json');
    expect(blocks[1].attributes.number).toBe(100);
    expect(blocks[1].startLine).toBe(4);

    expect(blocks[2].type).toBe('xml');
    expect(blocks[2].attributes.number).toBe(2);
    expect(blocks[2].attributes.async).toBe(true);
    expect(blocks[2].startLine).toBe(9);

    expect(blocks[3].type).toBe('json');
    expect(blocks[3].attributes.number).toBe(101);
    expect(blocks[3].attributes.compute).toBe("go");
    expect(blocks[3].startLine).toBe(11);
  });

  it('should return empty array if no blocks are found', () => {
    const fileContent = `
      // No taylored blocks here.
      const x = 1;
    `;
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(0);
  });

  it('should skip XML block with malformed/missing number', () => {
    const fileContent = `// <taylored number="abc">content</taylored>`;
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(0);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("invalid number 'abc'"));
    consoleWarnSpy.mockRestore();
  });

  it('should skip JSON block with malformed/missing number', () => {
    const fileContent = `{"taylored": "xyz", "content": "test"}`;
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(0);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("invalid number 'xyz'"));
    consoleWarnSpy.mockRestore();
  });

  it('should skip JSON block with missing content string', () => {
    const fileContent = `{"taylored": 103, "content": 123}`; // content is not a string
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(0);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("has invalid or missing 'content' (must be a string)"));
    consoleWarnSpy.mockRestore();
  });

  it('should skip malformed JSON block (unparseable)', () => {
    const fileContent = `{"taylored": 104, "content": "test", malformed`;
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(0);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Could not parse JSON"));
    consoleWarnSpy.mockRestore();
  });

  it('should handle XML block with single quotes for attributes', () => {
    const fileContent = `<taylored number='4' compute='py' async='true'>content</taylored>`;
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    expect(block.attributes.number).toBe(4);
    expect(block.attributes.compute).toBe('py');
    expect(block.attributes.async).toBe(true);
  });

  it('should handle XML block with no extra attributes', () => {
    const fileContent = `<taylored number="5">content</taylored>`;
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].attributes.number).toBe(5);
    expect(blocks[0].attributes.compute).toBeUndefined();
    expect(blocks[0].attributes.async).toBe(false);
    expect(blocks[0].attributes.disabled).toBe(false);
  });

  it('should correctly calculate startLine for blocks at the beginning of the file', () => {
    const fileContent = `<taylored number="6">First line block</taylored>
    // <taylored number="7">Second line block</taylored>`;
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].attributes.number).toBe(6);
    expect(blocks[0].startLine).toBe(1);
    expect(blocks[1].attributes.number).toBe(7);
    expect(blocks[1].startLine).toBe(2);
  });

  it('JSON block as a value in a key-value pair', () => {
    const fileContent = `
      const myData = {
        "patch_instruction": {
          "taylored": 777,
          "content": "apply this"
        }
      }
    `;
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    expect(block.attributes.number).toBe(777);
    expect(block.content).toBe("apply this");
    expect(block.fullMatch).toMatch(/^"patch_instruction":\s*{[\s\S]*?}/); // Check that fullMatch includes the key
    expect(block.startLine).toBe(3);
  });

  it('should handle empty content in XML block', () => {
    const fileContent = `// <taylored number="8"></taylored>`;
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].attributes.number).toBe(8);
    expect(blocks[0].content).toBe('');
  });

  it('should handle empty content in JSON block', () => {
    const fileContent = `{"taylored": 105, "content": ""}`;
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].attributes.number).toBe(105);
    expect(blocks[0].content).toBe("");
  });

  it('should handle XML block with extra spacing around attributes', () => {
    const fileContent = `<taylored  number = "9"   compute = "sh"  >content</taylored>`;
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    expect(block.attributes.number).toBe(9);
    expect(block.attributes.compute).toBe('sh');
  });

   it('should correctly parse content with escaped characters in JSON string', () => {
    const fileContent = `{"taylored": 106, "content": "console.log(\\"hello world\\");"}`;
    const blocks = parser.parse(fileContent, mockFilePath);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].content).toBe('console.log(\\"hello world\\");');
  });

});

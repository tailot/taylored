import * as fs from 'fs/promises';
import * as path from 'path';
import {
  sortPatchesNumerically,
  findPatchesInDirectory,
} from '../../lib/utils'; // Adjust path as needed
import { TAYLORED_FILE_EXTENSION } from '../../lib/constants'; // Corrected import path
// Mock fs module for findPatchesInDirectory tests
jest.mock('fs/promises');

describe('lib/utils', () => {
  describe('sortPatchesNumerically', () => {
    it('should sort files with numeric prefixes in ascending order', () => {
      const files = [
        '10-fix.taylored',
        '1-feature.taylored',
        '2-another.taylored',
      ];
      const sorted = sortPatchesNumerically(files);
      expect(sorted).toEqual([
        '1-feature.taylored',
        '2-another.taylored',
        '10-fix.taylored',
      ]);
    });

    it('should place files without numeric prefixes after numerically sorted files', () => {
      const files = [
        'fix.taylored',
        '10-fix.taylored',
        '1-feature.taylored',
        'another.taylored',
      ];
      const sorted = sortPatchesNumerically(files);
      expect(sorted).toEqual([
        '1-feature.taylored',
        '10-fix.taylored',
        'another.taylored',
        'fix.taylored',
      ]);
    });

    it('should sort files without numeric prefixes alphabetically', () => {
      const files = ['zebra.taylored', 'apple.taylored', 'banana.taylored'];
      const sorted = sortPatchesNumerically(files);
      expect(sorted).toEqual([
        'apple.taylored',
        'banana.taylored',
        'zebra.taylored',
      ]);
    });

    it('should handle mixed list of files correctly', () => {
      const files = [
        'common/10-sub-fix.taylored',
        '1-feature.taylored',
        'fix.taylored',
        'common/2-sub-feature.taylored',
        '0-critical.taylored',
        'another.taylored',
        'common/no-prefix.taylored',
      ];
      const sorted = sortPatchesNumerically(files);
      expect(sorted).toEqual([
        '0-critical.taylored',
        '1-feature.taylored',
        'common/2-sub-feature.taylored',
        'common/10-sub-fix.taylored',
        'another.taylored',
        'fix.taylored',
        'common/no-prefix.taylored',
      ]);
    });

    it('should return an empty array if input is empty', () => {
      expect(sortPatchesNumerically([])).toEqual([]);
    });

    it('should handle files with numbers not at the beginning as non-prefixed', () => {
      const files = [
        'feature-1.taylored',
        '1-alpha.taylored',
        'fix-10.taylored',
      ];
      const sorted = sortPatchesNumerically(files);
      expect(sorted).toEqual([
        '1-alpha.taylored',
        'feature-1.taylored',
        'fix-10.taylored',
      ]);
    });

    it('should correctly sort path like structures', () => {
      const files = [
        'group1/10-b.taylored',
        'group1/1-a.taylored',
        '2-c.taylored',
      ];
      const sorted = sortPatchesNumerically(files);
      expect(sorted).toEqual([
        'group1/1-a.taylored',
        '2-c.taylored',
        'group1/10-b.taylored',
      ]);
    });
  });

  describe('findPatchesInDirectory', () => {
    const mockFs = fs as jest.Mocked<typeof fs>;

    beforeEach(() => {
      // Reset mocks before each test
      mockFs.readdir.mockReset();
      mockFs.stat.mockReset(); // If stat is used by the function, though the current impl does not directly use it, readdir withFileTypes does.
    });

    it('should find .taylored files in a flat directory', async () => {
      const dirPath = '/testDir';
      mockFs.readdir.mockResolvedValueOnce([
        {
          name: '1-patch.taylored',
          isFile: () => true,
          isDirectory: () => false,
        },
        {
          name: '2-patch.taylored',
          isFile: () => true,
          isDirectory: () => false,
        },
        { name: 'other.txt', isFile: () => true, isDirectory: () => false },
      ] as any); // Using 'as any' to simplify Dirent mock

      const result = await findPatchesInDirectory(dirPath);
      expect(result).toEqual([
        path.join(dirPath, '1-patch.taylored'),
        path.join(dirPath, '2-patch.taylored'),
      ]);
      expect(mockFs.readdir).toHaveBeenCalledWith(dirPath, {
        withFileTypes: true,
      });
    });

    it('should find .taylored files recursively in nested directories', async () => {
      const basePath = '/base';
      const subDir1Path = path.join(basePath, 'subDir1');
      const subDir2Path = path.join(subDir1Path, 'subDir2');

      // Mock for basePath
      mockFs.readdir.mockImplementation(async (p) => {
        if (p === basePath) {
          return [
            {
              name: 'root.taylored',
              isFile: () => true,
              isDirectory: () => false,
            },
            { name: 'subDir1', isFile: () => false, isDirectory: () => true },
            {
              name: 'ignored.txt',
              isFile: () => true,
              isDirectory: () => false,
            },
          ] as any;
        }
        if (p === subDir1Path) {
          return [
            {
              name: 'sub1.taylored',
              isFile: () => true,
              isDirectory: () => false,
            },
            { name: 'subDir2', isFile: () => false, isDirectory: () => true },
          ] as any;
        }
        if (p === subDir2Path) {
          return [
            {
              name: 'sub2.taylored',
              isFile: () => true,
              isDirectory: () => false,
            },
          ] as any;
        }
        return [];
      });

      const result = await findPatchesInDirectory(basePath);
      expect(result.sort()).toEqual(
        [
          path.join(basePath, 'root.taylored'),
          path.join(subDir1Path, 'sub1.taylored'),
          path.join(subDir2Path, 'sub2.taylored'),
        ].sort(),
      );
      expect(mockFs.readdir).toHaveBeenCalledWith(basePath, {
        withFileTypes: true,
      });
      expect(mockFs.readdir).toHaveBeenCalledWith(subDir1Path, {
        withFileTypes: true,
      });
      expect(mockFs.readdir).toHaveBeenCalledWith(subDir2Path, {
        withFileTypes: true,
      });
    });

    it('should return an empty array if no .taylored files are found', async () => {
      const dirPath = '/emptyDir';
      mockFs.readdir.mockResolvedValueOnce([
        { name: 'other.txt', isFile: () => true, isDirectory: () => false },
        { name: 'another.md', isFile: () => true, isDirectory: () => false },
      ] as any);
      const result = await findPatchesInDirectory(dirPath);
      expect(result).toEqual([]);
    });

    it('should return an empty array for an empty directory', async () => {
      const dirPath = '/trulyEmptyDir';
      mockFs.readdir.mockResolvedValueOnce([]);
      const result = await findPatchesInDirectory(dirPath);
      expect(result).toEqual([]);
    });

    it('should handle errors from fs.readdir gracefully (e.g. permission denied)', async () => {
      const dirPath = '/errorDir';
      mockFs.readdir.mockRejectedValueOnce(new Error('Permission denied'));
      await expect(findPatchesInDirectory(dirPath)).rejects.toThrow(
        'Permission denied',
      );
    });
  });
});

// Add tests for list-handler's tree printing logic
// This is more complex due to console.log mocking and verification.
// For now, focusing on utils, list-handler will be primarily covered by E2E.
// If specific logic in list-handler needs unit testing beyond simple cases,
// it can be extracted or tested with more involved console mocking.

describe('lib/handlers/list-handler (Conceptual Unit Tests)', () => {
  // Basic conceptual tests for printDirectoryTree might involve:
  // - Mocking fs.readdir and fs.stat (if used directly)
  // - Capturing console.log output
  // - Verifying the structure of the output string.
  // This setup can be extensive.
  // For instance, a test for an empty directory, a directory with one file, etc.
  // Example:
  // it('should print a simple tree for one file', async () => {
  //   const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  //   mockFs.readdir.mockResolvedValueOnce([{ name: 'file.taylored', isFile: () => true, isDirectory: () => false }] as any);
  //   await printDirectoryTree('/fakeDir', ''); // Assuming printDirectoryTree is exported or tested via handleListOperation
  //   expect(consoleSpy.mock.calls.join('\n')).toContain('└── 📄 file.taylored');
  //   consoleSpy.mockRestore();
  // });
  // Due to the complexity and the fact that list-handler's core logic is the tree traversal and printing,
  // which is highly dependent on the sequence and formatting of console.log,
  // E2E tests will provide more robust coverage for its behavior.
  // The plan already includes E2E tests for --list output.
  it('Conceptual: list-handler tests will be primarily E2E as per plan', () => {
    expect(true).toBe(true); // Placeholder
  });
});

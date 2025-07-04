import { PatchAnalyzer } from '../../lib/PatchAnalyzer';
import * as fs from 'fs';

describe('PatchAnalyzer', () => {
  let analyzer: PatchAnalyzer;

  beforeEach(() => {
    analyzer = new PatchAnalyzer();
  });

  describe('parseHunkHeader', () => {
    it('should correctly parse a hunk header for a new file', () => {
      const header = '@@ -0,0 +1,10 @@';
      // @ts-ignore - private method
      const result = analyzer.parseHunkHeader(header);
      expect(result).toEqual({
        oldStart: 0,
        oldCount: 0,
        newStart: 1,
        newCount: 10,
      });
    });
  });
});

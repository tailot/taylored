import * as fs from 'fs';
import * as path from 'path';
import { execSync, ExecSyncOptionsWithBufferEncoding } from 'child_process';

const normalizeLineEndings = (str: string): string => {
  return str.replace(/\r\n/g, '\n');
};

const PROJECT_ROOT_PATH = path.resolve(__dirname, '../..');
const TEST_SUBDIR_NAME = "taylored_test_repo_space";
const TEST_DIR_FULL_PATH = path.join(PROJECT_ROOT_PATH, TEST_SUBDIR_NAME);
const TAYLORED_CMD_BASE = `npx ts-node ${path.join(PROJECT_ROOT_PATH, 'index.ts')}`;
const TAYLORED_DIR_NAME = ".taylored";
const TAYLORED_DIR_FULL_PATH = path.join(TEST_DIR_FULL_PATH, TAYLORED_DIR_NAME);

const BRANCH_DELETIONS = "deletions-branch";
const PLUGIN_DELETIONS_NAME = `${BRANCH_DELETIONS}.taylored`;
const PLUGIN_DELETIONS_FULL_PATH = path.join(TAYLORED_DIR_FULL_PATH, PLUGIN_DELETIONS_NAME);
const PLUGIN_DELETIONS_NO_EXT = BRANCH_DELETIONS;

let initialCommitHash: string;
let INITIAL_FILE1_CONTENT: string;
let INITIAL_FILE_TO_DELETE_CONTENT: string;
let MODIFIED_FILE1_DELETIONS_CONTENT: string;

const execOptions: ExecSyncOptionsWithBufferEncoding = {
  cwd: TEST_DIR_FULL_PATH,
  stdio: 'pipe'
};

const resetToInitialState = (skipDeletionPatchResave = false) => {
  try {
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', execOptions).toString().trim();
    if (currentBranch !== 'main') {
        execSync('git checkout main', execOptions);
    }
    execSync('git clean -fdx', execOptions);
    execSync(`git reset --hard ${initialCommitHash}`, execOptions);

    if (!fs.existsSync(TAYLORED_DIR_FULL_PATH)) {
      fs.mkdirSync(TAYLORED_DIR_FULL_PATH, { recursive: true });
    }
    if (!skipDeletionPatchResave) {
        // Re-save the deletions patch as it's used by many tests and reset might clean it
        execSync(`${TAYLORED_CMD_BASE} --save ${BRANCH_DELETIONS}`, execOptions);
    }

  } catch (error) {
    console.error("Error resetting state:", (error as any).message);
    if ((error as any).stdout) console.error("STDOUT (resetToInitialState):", (error as any).stdout.toString());
    if ((error as any).stderr) console.error("STDERR (resetToInitialState):", (error as any).stderr.toString());
    throw error;
  }
};

const applyDeletionsPatch = () => {
  execSync(`${TAYLORED_CMD_BASE} --add ${PLUGIN_DELETIONS_NAME}`, execOptions);
};

describe('Taylored E2E Tests', () => {
  beforeAll(() => {
    console.log("Setting up test Git repository...");
    if (fs.existsSync(TEST_DIR_FULL_PATH)) {
      fs.rmSync(TEST_DIR_FULL_PATH, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR_FULL_PATH, { recursive: true });

    execSync('git init -b main', execOptions);
    execSync('git config user.email "test@example.com"', execOptions);
    execSync('git config user.name "Test User"', execOptions);
    execSync('git config commit.gpgsign false', execOptions);

    INITIAL_FILE1_CONTENT = 'L1: Initial content for file1.\nL2: Line two.\nL3: Line three.\nL4: Line four.\nL5: Line five.\n';
    INITIAL_FILE_TO_DELETE_CONTENT = 'Content of file to be deleted.';
    fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), INITIAL_FILE1_CONTENT);
    fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'), INITIAL_FILE_TO_DELETE_CONTENT);
    execSync('git add file1.txt file_to_delete.txt', execOptions);
    execSync('git commit -m "Initial commit"', execOptions);
    initialCommitHash = execSync('git rev-parse HEAD', execOptions).toString().trim();

    execSync(`git checkout -b ${BRANCH_DELETIONS}`, execOptions);
    MODIFIED_FILE1_DELETIONS_CONTENT = 'L1: Initial content for file1.\nL3: Line three.\nL5: Line five.\n'; // L2 and L4 deleted
    fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), MODIFIED_FILE1_DELETIONS_CONTENT);
    if(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))) {
      fs.rmSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'));
    }
    execSync('git add file1.txt file_to_delete.txt', execOptions);
    execSync('git commit -m "Modify file1 and delete file_to_delete"', execOptions);
    execSync('git checkout main', execOptions);

    if (!fs.existsSync(TAYLORED_DIR_FULL_PATH)) {
      fs.mkdirSync(TAYLORED_DIR_FULL_PATH, { recursive: true });
    }
    execSync(`${TAYLORED_CMD_BASE} --save ${BRANCH_DELETIONS}`, execOptions);
    if (!fs.existsSync(PLUGIN_DELETIONS_FULL_PATH)) {
      throw new Error(`Failed to create plugin file ${PLUGIN_DELETIONS_FULL_PATH} in beforeAll`);
    }
    console.log(`Test Git repository setup complete. Initial commit: ${initialCommitHash}. Patch ${PLUGIN_DELETIONS_NAME} created.`);
  });

  afterAll(() => {
    console.log("Cleaning up...");
    process.chdir(PROJECT_ROOT_PATH);
    if (fs.existsSync(TEST_DIR_FULL_PATH)) {
      fs.rmSync(TEST_DIR_FULL_PATH, { recursive: true, force: true });
    }
    console.log("Cleanup complete.");
  });

  beforeEach(() => {
    resetToInitialState();
  });

  test('initial setup correctly created files and patch', () => {
    expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(normalizeLineEndings(INITIAL_FILE1_CONTENT));
    expect(fs.existsSync(PLUGIN_DELETIONS_FULL_PATH)).toBe(true);
  });

  // ... (previous describe blocks for Core, Additions, Mixed, Fuzzy, Idempotent tests remain unchanged) ...
  // (For brevity, I'm omitting the previously added tests here. They should be retained in the actual file.)

  describe('Core taylored commands', () => {
    test('taylored --list: lists saved patch files', () => {
      const output = execSync(`${TAYLORED_CMD_BASE} --list`, execOptions).toString();
      expect(output).toContain(PLUGIN_DELETIONS_NAME);
    });

    describe('taylored --verify-add (deletions patch)', () => {
      test('verifies patch addition (with .taylored extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --verify-add ${PLUGIN_DELETIONS_NAME}`, execOptions);
        expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(normalizeLineEndings(INITIAL_FILE1_CONTENT));
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(true);
      });
      test('verifies patch addition (without .taylored extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --verify-add ${PLUGIN_DELETIONS_NO_EXT}`, execOptions);
        expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(normalizeLineEndings(INITIAL_FILE1_CONTENT));
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(true);
      });
    });

    describe('taylored --add (deletions patch)', () => {
      test('adds patch (with .taylored extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --add ${PLUGIN_DELETIONS_NAME}`, execOptions);
        expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(normalizeLineEndings(MODIFIED_FILE1_DELETIONS_CONTENT));
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(false);
      });
      test('adds patch (without .taylored extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --add ${PLUGIN_DELETIONS_NO_EXT}`, execOptions);
        expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(normalizeLineEndings(MODIFIED_FILE1_DELETIONS_CONTENT));
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(false);
      });
    });

    describe('taylored --verify-remove (deletions patch)', () => {
      beforeEach(() => applyDeletionsPatch());
      test('verifies patch removal (with .taylored extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --verify-remove ${PLUGIN_DELETIONS_NAME}`, execOptions);
        expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(normalizeLineEndings(MODIFIED_FILE1_DELETIONS_CONTENT));
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(false);
      });
      test('verifies patch removal (without .taylored extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --verify-remove ${PLUGIN_DELETIONS_NO_EXT}`, execOptions);
        expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(normalizeLineEndings(MODIFIED_FILE1_DELETIONS_CONTENT));
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(false);
      });
    });

    describe('taylored --remove (deletions patch)', () => {
      beforeEach(() => applyDeletionsPatch());
      test('removes patch (with .taylored extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --remove ${PLUGIN_DELETIONS_NAME}`, execOptions);
        expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(normalizeLineEndings(INITIAL_FILE1_CONTENT));
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(true);
      });
      test('removes patch (without .taylored extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --remove ${PLUGIN_DELETIONS_NO_EXT}`, execOptions);
        expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(normalizeLineEndings(INITIAL_FILE1_CONTENT));
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(true);
      });
    });
  });

  describe('Additions Patch Tests', () => {
    const BRANCH_ADDITIONS = "additions-branch";
    const PLUGIN_ADDITIONS_NAME = `${BRANCH_ADDITIONS}.taylored`;
    const PLUGIN_ADDITIONS_NO_EXT = BRANCH_ADDITIONS;
    const PLUGIN_ADDITIONS_FULL_PATH = path.join(TAYLORED_DIR_FULL_PATH, PLUGIN_ADDITIONS_NAME);
    // MODIFIED_FILE1_ADDITIONS_CONTENT is not used as file1.txt is not modified by this patch anymore
    let NEW_FILE_CONTENT: string;

    // Function to create the manual patch content
    const createAdditionsPatchContent = () => `diff --git a/new_file.txt b/new_file.txt
new file mode 100644
index 0000000..b902982
--- /dev/null
+++ b/new_file.txt

+A new line for the new file.
+`;

    beforeAll(() => {
      // This beforeAll now only creates the branch with the new file.
      // The patch file itself will be created in the beforeEach.
      // Global beforeEach's resetToInitialState(true) will run before this.
      NEW_FILE_CONTENT = "A new line for the new file.\n";
      execSync(`git checkout -b ${BRANCH_ADDITIONS} ${initialCommitHash}`, execOptions);
      fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, 'new_file.txt'), NEW_FILE_CONTENT);
      execSync('git add new_file.txt', execOptions);
      execSync('git commit -m "Create new_file.txt for additions branch"', execOptions);
      execSync('git checkout main', execOptions);
    });

    beforeEach(() => {
      // Global beforeEach resetToInitialState() runs first, cleaning the directory.
      // Then, this suite-specific beforeEach runs to ensure the patch file exists.
      if (!fs.existsSync(TAYLORED_DIR_FULL_PATH)) {
        fs.mkdirSync(TAYLORED_DIR_FULL_PATH, { recursive: true });
      }
      fs.writeFileSync(PLUGIN_ADDITIONS_FULL_PATH, createAdditionsPatchContent());
      if (!fs.existsSync(PLUGIN_ADDITIONS_FULL_PATH)) {
        // This check is crucial. If the file isn't here, the tests will fail.
        throw new Error(`Additions suite specific beforeEach failed to create ${PLUGIN_ADDITIONS_FULL_PATH}`);
      }
    });

     afterAll(() => { // Clean up specific branch
        try {
            execSync(`git branch -D ${BRANCH_ADDITIONS}`, execOptions);
            // The manually created patch file (.taylored/additions-branch.taylored)
            // will be removed by the main resetToInitialState's "git clean -fdx"
            // before the next test suite runs, or before the next test in this suite via its beforeEach.
        } catch (e) {
            console.warn(`Warning: Could not clean up ${BRANCH_ADDITIONS}. ${(e as any).message}`);
        }
    });

    test('taylored --add (additions patch, with extension)', () => {
      execSync(`${TAYLORED_CMD_BASE} --add ${PLUGIN_ADDITIONS_NAME}`, execOptions);
      expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(normalizeLineEndings(INITIAL_FILE1_CONTENT)); // file1.txt should be unchanged
      expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'new_file.txt'))).toBe(true);
    });

    test('taylored --add (additions patch, without extension)', () => {
      execSync(`${TAYLORED_CMD_BASE} --add ${PLUGIN_ADDITIONS_NO_EXT}`, execOptions);
      expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(normalizeLineEndings(INITIAL_FILE1_CONTENT)); // file1.txt should be unchanged
      expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'new_file.txt'))).toBe(true);
    });

    describe('taylored --remove (additions patch)', () => {
      beforeEach(() => {
        execSync(`${TAYLORED_CMD_BASE} --add ${PLUGIN_ADDITIONS_NAME}`, execOptions);
      });
      test('removes additions patch (with extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --remove ${PLUGIN_ADDITIONS_NAME}`, execOptions);
        expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(normalizeLineEndings(INITIAL_FILE1_CONTENT));
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'new_file.txt'))).toBe(false);
      });
      test('removes additions patch (without extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --remove ${PLUGIN_ADDITIONS_NO_EXT}`, execOptions);
        expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(normalizeLineEndings(INITIAL_FILE1_CONTENT));
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'new_file.txt'))).toBe(false);
      });
    });
  });

  describe('Mixed Changes Save Test (Should Fail or Not Create Patch)', () => {
    test('taylored --save with mixed add/delete in same file', () => {
      const BRANCH_MIXED = "mixed-changes-branch";
      const PLUGIN_MIXED_NAME = `${BRANCH_MIXED}.taylored`;
      const PLUGIN_MIXED_FULL_PATH = path.join(TAYLORED_DIR_FULL_PATH, PLUGIN_MIXED_NAME);
      let failed = false;
      try {
        execSync(`git checkout -b ${BRANCH_MIXED} ${initialCommitHash}`, execOptions);
        const mixedContent = INITIAL_FILE1_CONTENT.substring(0, 10) + " changed " + INITIAL_FILE1_CONTENT.substring(20) + "\nnew line";
        fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), mixedContent);
        execSync('git add file1.txt', execOptions);
        execSync('git commit -m "Mixed changes to file1"', execOptions);
        execSync('git checkout main', execOptions);
        execSync(`${TAYLORED_CMD_BASE} --save ${BRANCH_MIXED}`, execOptions);
      } catch (error) {
        failed = true;
      } finally {
          execSync(`git branch -D ${BRANCH_MIXED}`, execOptions); // Clean up branch
      }
      expect(failed || !fs.existsSync(PLUGIN_MIXED_FULL_PATH)).toBe(true);
      if (fs.existsSync(PLUGIN_MIXED_FULL_PATH)) {
          if (!failed) expect(fs.statSync(PLUGIN_MIXED_FULL_PATH).size).toBe(0);
          fs.unlinkSync(PLUGIN_MIXED_FULL_PATH); // Clean up plugin if created
      }
    });
  });

  describe('Fuzzy Patching Test', () => {
    test('taylored --add on slightly modified file (deletions patch)', () => {
      fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), INITIAL_FILE1_CONTENT + "\nSlight modification.");
      let success = false;
      let rejFilePath = path.join(TEST_DIR_FULL_PATH, 'file1.txt.rej');
      try {
        execSync(`${TAYLORED_CMD_BASE} --add ${PLUGIN_DELETIONS_NAME}`, execOptions);
        success = true;
      } catch (e) {
        expect(fs.existsSync(rejFilePath)).toBe(true);
      } finally {
        if (fs.existsSync(rejFilePath)) fs.unlinkSync(rejFilePath);
      }
      if (success) {
        expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8')))
          .toBe(normalizeLineEndings(MODIFIED_FILE1_DELETIONS_CONTENT + "\nSlight modification."));
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(false);
      }
    });
  });

  describe('Idempotent Remove Test', () => {
    test('taylored --remove when patch not applied (deletions patch)', () => {
      let commandOutput = "";
      try {
        commandOutput = execSync(`${TAYLORED_CMD_BASE} --remove ${PLUGIN_DELETIONS_NAME}`, execOptions).toString();
      } catch (error) {
        commandOutput = ((error as any).stdout?.toString() || "") + ((error as any).stderr?.toString() || "");
      }
      expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(normalizeLineEndings(INITIAL_FILE1_CONTENT));
      expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(true);
      expect(commandOutput.toLowerCase()).toContain("critical error: 'git apply' failed during --remove operation");
    });
  });

  describe('Offset Functionality Tests', () => {
    // Initial content for offset test files should be multi-line to allow context shifting
    const OFFSET_INITIAL_CONTENT = [
        "Line 1: Initial context",
        "Line 2: Target for deletion/modification",
        "Line 3: More context",
        "Line 4: Even more context",
        "Line 5: Final context line"
    ].join('\n');

    const PREPEND_CONTENT = "Prepended Line 1\nPrepended Line 2\n";

    describe('Offset - Deletions Patch (Step 11)', () => {
        const OFFSET_DEL_FILE = "offset_del_file.txt";
        const OFFSET_DEL_BRANCH_S11 = "offset-del-branch-s11";
        const OFFSET_DEL_PLUGIN_NAME_S11 = `${OFFSET_DEL_BRANCH_S11}.taylored`;
        const OFFSET_DEL_PLUGIN_FULL_PATH_S11 = path.join(TAYLORED_DIR_FULL_PATH, OFFSET_DEL_PLUGIN_NAME_S11);
        let mainCommitForS11Patch: string;
        let storedOffsetDelPluginS11Content: string;
        let mainModifiedContentS11: string;

        beforeEach(async () => {
            resetToInitialState(true); // true to skip re-saving main deletions patch

            fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_DEL_FILE), OFFSET_INITIAL_CONTENT);
            execSync(`git add ${OFFSET_DEL_FILE}`, execOptions);
            execSync('git commit -m "Initial commit for S11 offset test"', execOptions);
            mainCommitForS11Patch = execSync('git rev-parse HEAD', execOptions).toString().trim();

            execSync(`git checkout -b ${OFFSET_DEL_BRANCH_S11} ${mainCommitForS11Patch}`, execOptions);
            const s11DeletedContent = OFFSET_INITIAL_CONTENT.replace("Line 2: Target for deletion/modification\n", "");
            fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_DEL_FILE), s11DeletedContent);
            execSync(`git add ${OFFSET_DEL_FILE}`, execOptions);
            execSync('git commit -m "Delete line for S11 patch"', execOptions);

            execSync(`git checkout main`, execOptions);
            execSync(`git reset --hard ${mainCommitForS11Patch}`, execOptions); // Back to pre-branch state

            execSync(`${TAYLORED_CMD_BASE} --save ${OFFSET_DEL_BRANCH_S11}`, execOptions);
            execSync('git add .', execOptions); // Commit the newly saved patch
            execSync('git commit -m "chore: save S11 offset patch for testing"', execOptions);
            expect(fs.existsSync(OFFSET_DEL_PLUGIN_FULL_PATH_S11)).toBe(true);
            storedOffsetDelPluginS11Content = fs.readFileSync(OFFSET_DEL_PLUGIN_FULL_PATH_S11, 'utf8');

            mainModifiedContentS11 = PREPEND_CONTENT + OFFSET_INITIAL_CONTENT;
            fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_DEL_FILE), mainModifiedContentS11);
            execSync(`git add ${OFFSET_DEL_FILE}`, execOptions);
            execSync('git commit -m "Prepend lines on main to cause offset for S11"', execOptions);
        });

        afterEach(() => {
            try {
                execSync(`git branch -D ${OFFSET_DEL_BRANCH_S11}`, execOptions);
            } catch (e) { /* ignore if branch not found */ }
            if (fs.existsSync(OFFSET_DEL_PLUGIN_FULL_PATH_S11)) {
                fs.unlinkSync(OFFSET_DEL_PLUGIN_FULL_PATH_S11);
            }
        });

        test('taylored --offset for deletions patch fails as expected', () => {
            let stderr = "";
            let failed = false;
            try {
                execSync(`${TAYLORED_CMD_BASE} --offset ${OFFSET_DEL_PLUGIN_NAME_S11}`, execOptions);
            } catch (error) {
                failed = true;
                stderr = (error as any).stderr?.toString() || "";
            }
            expect(failed).toBe(true);
            expect(stderr.toLowerCase()).toMatch(/obsolete|could not be processed|patch does not apply|offset failed/);
            expect(normalizeLineEndings(fs.readFileSync(OFFSET_DEL_PLUGIN_FULL_PATH_S11, 'utf8'))).toBe(normalizeLineEndings(storedOffsetDelPluginS11Content));
            expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_DEL_FILE), 'utf8'))).toBe(normalizeLineEndings(mainModifiedContentS11));
        });
    });

    describe('Offset - Additions Patch (Step 12)', () => {
        const OFFSET_ADD_FILE_S12 = "offset_add_file.txt";
        const OFFSET_ADD_BRANCH_S12 = "offset-add-branch-s12";
        const OFFSET_ADD_PLUGIN_NAME_S12 = `${OFFSET_ADD_BRANCH_S12}.taylored`;
        const OFFSET_ADD_PLUGIN_FULL_PATH_S12 = path.join(TAYLORED_DIR_FULL_PATH, OFFSET_ADD_PLUGIN_NAME_S12);
        let mainCommitForS12Patch: string;
        let storedOffsetAddPluginS12Content: string;
        let mainModifiedContentS12: string;

        beforeEach(() => {
            resetToInitialState(true);

            fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_ADD_FILE_S12), OFFSET_INITIAL_CONTENT);
            execSync(`git add ${OFFSET_ADD_FILE_S12}`, execOptions);
            execSync('git commit -m "Initial commit for S12 offset test"', execOptions);
            mainCommitForS12Patch = execSync('git rev-parse HEAD', execOptions).toString().trim();

            execSync(`git checkout -b ${OFFSET_ADD_BRANCH_S12} ${mainCommitForS12Patch}`, execOptions);
            const s12AddedContent = OFFSET_INITIAL_CONTENT.replace("Line 2: Target for deletion/modification",
                "Line 2: Target for deletion/modification\nLine 2.5: Newly added line for S12 patch");
            fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_ADD_FILE_S12), s12AddedContent);
            execSync(`git add ${OFFSET_ADD_FILE_S12}`, execOptions);
            execSync('git commit -m "Add line for S12 patch"', execOptions);

            execSync(`git checkout main`, execOptions);
            execSync(`git reset --hard ${mainCommitForS12Patch}`, execOptions);

            execSync(`${TAYLORED_CMD_BASE} --save ${OFFSET_ADD_BRANCH_S12}`, execOptions);
            execSync('git add .', execOptions); // Commit the newly saved patch
            execSync('git commit -m "chore: save S12 offset patch for testing"', execOptions);
            expect(fs.existsSync(OFFSET_ADD_PLUGIN_FULL_PATH_S12)).toBe(true);
            storedOffsetAddPluginS12Content = fs.readFileSync(OFFSET_ADD_PLUGIN_FULL_PATH_S12, 'utf8');

            mainModifiedContentS12 = PREPEND_CONTENT + OFFSET_INITIAL_CONTENT;
            fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_ADD_FILE_S12), mainModifiedContentS12);
            execSync(`git add ${OFFSET_ADD_FILE_S12}`, execOptions);
            execSync('git commit -m "Prepend lines on main to cause offset for S12"', execOptions);
        });

        afterEach(() => {
            try {
                execSync(`git branch -D ${OFFSET_ADD_BRANCH_S12}`, execOptions);
            } catch (e) { /* ignore */ }
            if (fs.existsSync(OFFSET_ADD_PLUGIN_FULL_PATH_S12)) {
                fs.unlinkSync(OFFSET_ADD_PLUGIN_FULL_PATH_S12);
            }
        });

        test('taylored --offset for additions patch fails as expected', () => {
            let stderr = "";
            let failed = false;
            try {
                execSync(`${TAYLORED_CMD_BASE} --offset ${OFFSET_ADD_PLUGIN_NAME_S12}`, execOptions);
            } catch (error) {
                failed = true;
                stderr = (error as any).stderr?.toString() || "";
            }
            expect(failed).toBe(true);
            expect(stderr.toLowerCase()).toMatch(/obsolete|could not be processed|patch does not apply|offset failed/);
            expect(normalizeLineEndings(fs.readFileSync(OFFSET_ADD_PLUGIN_FULL_PATH_S12, 'utf8'))).toBe(normalizeLineEndings(storedOffsetAddPluginS12Content));
            expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_ADD_FILE_S12), 'utf8'))).toBe(normalizeLineEndings(mainModifiedContentS12));
        });
    });
  });

  describe('--automatic command', () => {
    const TEST_SRC_DIR_NAME = "automatic_test_src";
    const TEST_SRC_DIR_FULL_PATH = path.join(TEST_DIR_FULL_PATH, TEST_SRC_DIR_NAME);

    const cleanupTestSrcDir = () => {
      if (fs.existsSync(TEST_SRC_DIR_FULL_PATH)) {
        fs.rmSync(TEST_SRC_DIR_FULL_PATH, { recursive: true, force: true });
      }
    };

    const cleanupTayloredDirContents = () => {
      if (fs.existsSync(TAYLORED_DIR_FULL_PATH)) {
        const files = fs.readdirSync(TAYLORED_DIR_FULL_PATH);
        for (const file of files) {
          // Keep the original deletions patch from global setup if it exists
          if (file !== PLUGIN_DELETIONS_NAME) {
            fs.unlinkSync(path.join(TAYLORED_DIR_FULL_PATH, file));
          }
        }
      }
    };
    
    beforeEach(() => {
      // resetToInitialState() is called by global beforeEach
      cleanupTestSrcDir(); // Clean any src files from previous automatic test
      fs.mkdirSync(TEST_SRC_DIR_FULL_PATH, { recursive: true });
      // Clean .taylored dir but preserve the main deletions patch used by other tests
      cleanupTayloredDirContents();
    });

    afterEach(() => {
      cleanupTestSrcDir();
      // Global resetToInitialState in next beforeEach will also clean .taylored,
      // but good to clean up specific files made by these tests.
      cleanupTayloredDirContents();
    });

    test('Single file, single block', () => {
      const singleTsContent = `// Before block
const x = 10;
// <taylored 1>
console.log("This is taylored block 1");
const importantNumber = 42;
// <taylored>
// After block
function greet() { console.log("hello"); }`;
      fs.writeFileSync(path.join(TEST_SRC_DIR_FULL_PATH, 'single.ts'), singleTsContent);

      execSync(`${TAYLORED_CMD_BASE} --automatic ts`, execOptions);

      const expectedFilePath = path.join(TAYLORED_DIR_FULL_PATH, 'single_taylored_1.taylored');
      expect(fs.existsSync(expectedFilePath)).toBe(true);
      const expectedContent = `console.log("This is taylored block 1");
const importantNumber = 42;`;
      expect(normalizeLineEndings(fs.readFileSync(expectedFilePath, 'utf8'))).toBe(normalizeLineEndings(expectedContent));
    });

    test('Single file, multiple blocks', () => {
      const multipleJsContent = `// <taylored 10>
// Block 10 content
// <taylored>
console.log('Some code');
// <taylored 2>
// Block 2 content
// <taylored>`;
      fs.writeFileSync(path.join(TEST_SRC_DIR_FULL_PATH, 'multiple.js'), multipleJsContent);

      execSync(`${TAYLORED_CMD_BASE} --automatic js`, execOptions);

      const expectedFilePath10 = path.join(TAYLORED_DIR_FULL_PATH, 'multiple_taylored_10.taylored');
      const expectedFilePath2 = path.join(TAYLORED_DIR_FULL_PATH, 'multiple_taylored_2.taylored');

      expect(fs.existsSync(expectedFilePath10)).toBe(true);
      expect(normalizeLineEndings(fs.readFileSync(expectedFilePath10, 'utf8'))).toBe(normalizeLineEndings('// Block 10 content'));

      expect(fs.existsSync(expectedFilePath2)).toBe(true);
      expect(normalizeLineEndings(fs.readFileSync(expectedFilePath2, 'utf8'))).toBe(normalizeLineEndings('// Block 2 content'));
    });

    test('Multiple files, mixed extensions', () => {
      const tsContent = `// <taylored 1>
// TS Block 1
// <taylored>`;
      fs.writeFileSync(path.join(TEST_SRC_DIR_FULL_PATH, 'another.ts'), tsContent);

      const pyContent = `# <taylored 5>
# Python Block 5
# <taylored>`;
      // Create subdir for this test
      const subDirPath = path.join(TEST_SRC_DIR_FULL_PATH, 'subdir');
      fs.mkdirSync(subDirPath, { recursive: true });
      fs.writeFileSync(path.join(subDirPath, 'another.py'), pyContent);

      // Test for .ts
      execSync(`${TAYLORED_CMD_BASE} --automatic ts`, execOptions);
      const tsExpectedFilePath = path.join(TAYLORED_DIR_FULL_PATH, 'another_taylored_1.taylored');
      const pyExpectedFilePath = path.join(TAYLORED_DIR_FULL_PATH, 'another_taylored_5.taylored');
      
      expect(fs.existsSync(tsExpectedFilePath)).toBe(true);
      expect(normalizeLineEndings(fs.readFileSync(tsExpectedFilePath, 'utf8'))).toBe(normalizeLineEndings('// TS Block 1'));
      expect(fs.existsSync(pyExpectedFilePath)).toBe(false); // Should not find .py file

      // Clean up .taylored for next run within the same test
      fs.unlinkSync(tsExpectedFilePath);

      // Test for .py
      execSync(`${TAYLORED_CMD_BASE} --automatic py`, execOptions);
      expect(fs.existsSync(tsExpectedFilePath)).toBe(false); // Should not find .ts file this time
      expect(fs.existsSync(pyExpectedFilePath)).toBe(true);
      expect(normalizeLineEndings(fs.readFileSync(pyExpectedFilePath, 'utf8'))).toBe(normalizeLineEndings('# Python Block 5'));
    });

    test('No markers found', () => {
      const noMarkersContent = `console.log("No markers here");`;
      fs.writeFileSync(path.join(TEST_SRC_DIR_FULL_PATH, 'no_markers.ts'), noMarkersContent);

      const output = execSync(`${TAYLORED_CMD_BASE} --automatic ts`, execOptions).toString();
      
      const tayloredFiles = fs.readdirSync(TAYLORED_DIR_FULL_PATH).filter(f => f.startsWith('no_markers'));
      expect(tayloredFiles.length).toBe(0);
      expect(output).toMatch(/No taylored blocks found/i);
    });

    test('No files with extension', () => {
      // Ensure no .java files exist in TEST_SRC_DIR_FULL_PATH
      const output = execSync(`${TAYLORED_CMD_BASE} --automatic java`, execOptions).toString();
      expect(output).toMatch(/No files found with extension: \.java/i);
    });

    test('Extension with and without leading dot', () => {
      const extTestContent = `// <taylored 7>
// Test extension
// <taylored>`;
      const baseFileName = 'extension_test';
      const tayloredFileName = `${baseFileName}_taylored_7.taylored`;
      const expectedContent = '// Test extension';
      
      // Test without leading dot
      fs.writeFileSync(path.join(TEST_SRC_DIR_FULL_PATH, `${baseFileName}.ext`), extTestContent);
      execSync(`${TAYLORED_CMD_BASE} --automatic ext`, execOptions);
      let expectedFilePath = path.join(TAYLORED_DIR_FULL_PATH, tayloredFileName);
      expect(fs.existsSync(expectedFilePath)).toBe(true);
      expect(normalizeLineEndings(fs.readFileSync(expectedFilePath, 'utf8'))).toBe(normalizeLineEndings(expectedContent));
      fs.unlinkSync(expectedFilePath); // Clean up for next part of test
      fs.unlinkSync(path.join(TEST_SRC_DIR_FULL_PATH, `${baseFileName}.ext`)); // Clean up src

      // Test with leading dot
      fs.writeFileSync(path.join(TEST_SRC_DIR_FULL_PATH, `${baseFileName}.ext`), extTestContent);
      execSync(`${TAYLORED_CMD_BASE} --automatic .ext`, execOptions);
      expectedFilePath = path.join(TAYLORED_DIR_FULL_PATH, tayloredFileName);
      expect(fs.existsSync(expectedFilePath)).toBe(true);
      expect(normalizeLineEndings(fs.readFileSync(expectedFilePath, 'utf8'))).toBe(normalizeLineEndings(expectedContent));
    });

    test('Invalid arguments: missing extension', () => {
      try {
        execSync(`${TAYLORED_CMD_BASE} --automatic`, execOptions);
        fail('Command should have failed'); 
      } catch (error: any) {
        expect(error.status).not.toBe(0); // Should exit with non-zero status
        expect(error.stderr.toString()).toMatch(/CRITICAL ERROR: --automatic option requires exactly one <EXTENSION> argument/i);
      }
    });

    test('Invalid arguments: invalid extension format (starts with --)', () => {
      try {
        execSync(`${TAYLORED_CMD_BASE} --automatic --invalid-arg`, execOptions);
        fail('Command should have failed');
      } catch (error: any) {
        expect(error.status).not.toBe(0);
        expect(error.stderr.toString()).toMatch(/CRITICAL ERROR: Invalid extension '--invalid-arg' after --automatic/i);
      }
    });
    
    test('Invalid arguments: extension with path separator', () => {
      try {
        execSync(`${TAYLORED_CMD_BASE} --automatic src/ts`, execOptions);
        fail('Command should have failed');
      } catch (error: any) {
        expect(error.status).not.toBe(0);
        expect(error.stderr.toString()).toMatch(/CRITICAL ERROR: <EXTENSION> \('.*src(\/|\\)ts.*'\) must be a simple extension string/i);
      }
    });

  });
});

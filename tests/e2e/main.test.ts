import * as fs from 'fs';
import * as path from 'path';
import { execSync, ExecSyncOptionsWithBufferEncoding } from 'child_process';

const PROJECT_ROOT_PATH = path.resolve(__dirname, '../../..'); // Assuming tests/e2e/main.test.ts
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
  stdio: 'pipe',
  encoding: 'utf-8'
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
        execSync(`${TAYLORED_CMD_BASE} --save ${BRANCH_DELETIONS} -v`, execOptions);
    }

  } catch (error) {
    console.error("Error resetting state:", error.message);
    if (error.stdout) console.error("STDOUT (resetToInitialState):", error.stdout.toString());
    if (error.stderr) console.error("STDERR (resetToInitialState):", error.stderr.toString());
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

    INITIAL_FILE1_CONTENT = 'L1: Initial content for file1.\nL2: Line two.\nL3: Line three.\nL4: Line four.\nL5: Line five.';
    INITIAL_FILE_TO_DELETE_CONTENT = 'Content of file to be deleted.';
    fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), INITIAL_FILE1_CONTENT);
    fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'), INITIAL_FILE_TO_DELETE_CONTENT);
    execSync('git add file1.txt file_to_delete.txt', execOptions);
    execSync('git commit -m "Initial commit"', execOptions);
    initialCommitHash = execSync('git rev-parse HEAD', execOptions).toString().trim();

    execSync(`git checkout -b ${BRANCH_DELETIONS}`, execOptions);
    MODIFIED_FILE1_DELETIONS_CONTENT = 'L1: Initial content for file1.\nL3: Line three.\nL5: Line five.'; // L2 and L4 deleted
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
    execSync(`${TAYLORED_CMD_BASE} --save ${BRANCH_DELETIONS} -v`, execOptions);
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
    expect(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8')).toBe(INITIAL_FILE1_CONTENT);
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
        expect(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8')).toBe(INITIAL_FILE1_CONTENT);
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(true);
      });
      test('verifies patch addition (without .taylored extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --verify-add ${PLUGIN_DELETIONS_NO_EXT}`, execOptions);
        expect(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8')).toBe(INITIAL_FILE1_CONTENT);
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(true);
      });
    });

    describe('taylored --add (deletions patch)', () => {
      test('adds patch (with .taylored extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --add ${PLUGIN_DELETIONS_NAME}`, execOptions);
        expect(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8')).toBe(MODIFIED_FILE1_DELETIONS_CONTENT);
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(false);
      });
      test('adds patch (without .taylored extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --add ${PLUGIN_DELETIONS_NO_EXT}`, execOptions);
        expect(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8')).toBe(MODIFIED_FILE1_DELETIONS_CONTENT);
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(false);
      });
    });

    describe('taylored --verify-remove (deletions patch)', () => {
      beforeEach(() => applyDeletionsPatch());
      test('verifies patch removal (with .taylored extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --verify-remove ${PLUGIN_DELETIONS_NAME}`, execOptions);
        expect(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8')).toBe(MODIFIED_FILE1_DELETIONS_CONTENT);
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(false);
      });
      test('verifies patch removal (without .taylored extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --verify-remove ${PLUGIN_DELETIONS_NO_EXT}`, execOptions);
        expect(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8')).toBe(MODIFIED_FILE1_DELETIONS_CONTENT);
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(false);
      });
    });

    describe('taylored --remove (deletions patch)', () => {
      beforeEach(() => applyDeletionsPatch());
      test('removes patch (with .taylored extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --remove ${PLUGIN_DELETIONS_NAME}`, execOptions);
        expect(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8')).toBe(INITIAL_FILE1_CONTENT);
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(true);
      });
      test('removes patch (without .taylored extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --remove ${PLUGIN_DELETIONS_NO_EXT}`, execOptions);
        expect(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8')).toBe(INITIAL_FILE1_CONTENT);
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(true);
      });
    });
  });

  describe('Additions Patch Tests', () => {
    const BRANCH_ADDITIONS = "additions-branch";
    const PLUGIN_ADDITIONS_NAME = `${BRANCH_ADDITIONS}.taylored`;
    const PLUGIN_ADDITIONS_NO_EXT = BRANCH_ADDITIONS;
    const PLUGIN_ADDITIONS_FULL_PATH = path.join(TAYLORED_DIR_FULL_PATH, PLUGIN_ADDITIONS_NAME);
    let MODIFIED_FILE1_ADDITIONS_CONTENT: string;
    let NEW_FILE_CONTENT: string;

    beforeAll(() => {
      resetToInitialState(true); // Skip re-saving deletions patch
      MODIFIED_FILE1_ADDITIONS_CONTENT = `${INITIAL_FILE1_CONTENT}\nAdded line for additions branch.`;
      NEW_FILE_CONTENT = "Content for the new file.";

      execSync(`git checkout -b ${BRANCH_ADDITIONS} ${initialCommitHash}`, execOptions);
      fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), MODIFIED_FILE1_ADDITIONS_CONTENT);
      fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, 'new_file.txt'), NEW_FILE_CONTENT);
      execSync('git add file1.txt new_file.txt', execOptions);
      execSync('git commit -m "Add new line to file1 and create new_file.txt"', execOptions);
      execSync('git checkout main', execOptions);

      execSync(`${TAYLORED_CMD_BASE} --save ${BRANCH_ADDITIONS} -v`, execOptions);
      if (!fs.existsSync(PLUGIN_ADDITIONS_FULL_PATH)) {
        throw new Error(`Failed to create plugin file ${PLUGIN_ADDITIONS_FULL_PATH}`);
      }
    });
     afterAll(() => { // Clean up specific branch and plugin for this suite
        try {
            execSync(`git branch -D ${BRANCH_ADDITIONS}`, execOptions);
            if (fs.existsSync(PLUGIN_ADDITIONS_FULL_PATH)) {
                fs.unlinkSync(PLUGIN_ADDITIONS_FULL_PATH);
            }
        } catch (e) {
            console.warn(`Warning: Could not clean up ${BRANCH_ADDITIONS} or its plugin. ${e.message}`);
        }
    });

    test('taylored --add (additions patch, with extension)', () => {
      execSync(`${TAYLORED_CMD_BASE} --add ${PLUGIN_ADDITIONS_NAME}`, execOptions);
      expect(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8')).toBe(MODIFIED_FILE1_ADDITIONS_CONTENT);
      expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'new_file.txt'))).toBe(true);
    });

    test('taylored --add (additions patch, without extension)', () => {
      execSync(`${TAYLORED_CMD_BASE} --add ${PLUGIN_ADDITIONS_NO_EXT}`, execOptions);
      expect(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8')).toBe(MODIFIED_FILE1_ADDITIONS_CONTENT);
      expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'new_file.txt'))).toBe(true);
    });

    describe('taylored --remove (additions patch)', () => {
      beforeEach(() => {
        execSync(`${TAYLORED_CMD_BASE} --add ${PLUGIN_ADDITIONS_NAME}`, execOptions);
      });
      test('removes additions patch (with extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --remove ${PLUGIN_ADDITIONS_NAME}`, execOptions);
        expect(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8')).toBe(INITIAL_FILE1_CONTENT);
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'new_file.txt'))).toBe(false);
      });
      test('removes additions patch (without extension)', () => {
        execSync(`${TAYLORED_CMD_BASE} --remove ${PLUGIN_ADDITIONS_NO_EXT}`, execOptions);
        expect(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8')).toBe(INITIAL_FILE1_CONTENT);
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
        execSync(`${TAYLORED_CMD_BASE} --save ${BRANCH_MIXED} -v`, execOptions);
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
        execSync(`${TAYLORED_CMD_BASE} --add ${PLUGIN_DELETIONS_NAME} -v`, execOptions);
        success = true;
      } catch (e) {
        expect(fs.existsSync(rejFilePath)).toBe(true);
      } finally {
        if (fs.existsSync(rejFilePath)) fs.unlinkSync(rejFilePath);
      }
      if (success) {
        expect(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))
          .toBe(MODIFIED_FILE1_DELETIONS_CONTENT + "\nSlight modification.");
        expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(false);
      }
    });
  });

  describe('Idempotent Remove Test', () => {
    test('taylored --remove when patch not applied (deletions patch)', () => {
      let commandOutput = "";
      try {
        commandOutput = execSync(`${TAYLORED_CMD_BASE} --remove ${PLUGIN_DELETIONS_NAME} -v`, execOptions).toString();
      } catch (error) {
        commandOutput = (error.stdout?.toString() || "") + (error.stderr?.toString() || "");
      }
      expect(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8')).toBe(INITIAL_FILE1_CONTENT);
      expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(true);
      expect(commandOutput.toLowerCase()).toMatch(/not applied|no changes made|patch was not found/);
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

            execSync(`${TAYLORED_CMD_BASE} --save ${OFFSET_DEL_BRANCH_S11} -v`, execOptions);
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
                execSync(`${TAYLORED_CMD_BASE} --offset ${OFFSET_DEL_PLUGIN_NAME_S11} -v`, execOptions);
            } catch (error) {
                failed = true;
                stderr = error.stderr?.toString() || "";
            }
            expect(failed).toBe(true);
            expect(stderr.toLowerCase()).toMatch(/obsolete|could not be processed|patch does not apply|offset failed/);
            expect(fs.readFileSync(OFFSET_DEL_PLUGIN_FULL_PATH_S11, 'utf8')).toBe(storedOffsetDelPluginS11Content);
            expect(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_DEL_FILE), 'utf8')).toBe(mainModifiedContentS11);
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

            execSync(`${TAYLORED_CMD_BASE} --save ${OFFSET_ADD_BRANCH_S12} -v`, execOptions);
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
                execSync(`${TAYLORED_CMD_BASE} --offset ${OFFSET_ADD_PLUGIN_NAME_S12} -v`, execOptions);
            } catch (error) {
                failed = true;
                stderr = error.stderr?.toString() || "";
            }
            expect(failed).toBe(true);
            expect(stderr.toLowerCase()).toMatch(/obsolete|could not be processed|patch does not apply|offset failed/);
            expect(fs.readFileSync(OFFSET_ADD_PLUGIN_FULL_PATH_S12, 'utf8')).toBe(storedOffsetAddPluginS12Content);
            expect(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_ADD_FILE_S12), 'utf8')).toBe(mainModifiedContentS12);
        });
    });
  });
});

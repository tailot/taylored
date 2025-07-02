import * as fs from 'fs';
import * as path from 'path';
import { execSync, ExecSyncOptionsWithBufferEncoding } from 'child_process';

// Exported Constants
export const PROJECT_ROOT_PATH = path.resolve(__dirname, '../../..'); // Adjusted path
export const TEST_SUBDIR_NAME = 'taylored_test_repo_space';
export const TEST_DIR_FULL_PATH = path.join(
  PROJECT_ROOT_PATH,
  TEST_SUBDIR_NAME,
);
export const TAYLORED_CMD_BASE = `node -r ts-node/register ${path.join(PROJECT_ROOT_PATH, 'index.ts')}`;
export const TAYLORED_DIR_NAME = '.taylored';
export const TAYLORED_DIR_FULL_PATH = path.join(
  TEST_DIR_FULL_PATH,
  TAYLORED_DIR_NAME,
);

export const BRANCH_DELETIONS = 'deletions-branch';
export const PLUGIN_DELETIONS_NAME = `${BRANCH_DELETIONS}.taylored`;
export const PLUGIN_DELETIONS_FULL_PATH = path.join(
  TAYLORED_DIR_FULL_PATH,
  PLUGIN_DELETIONS_NAME,
);
export const PLUGIN_DELETIONS_NO_EXT = BRANCH_DELETIONS;

export const execOptions: ExecSyncOptionsWithBufferEncoding = {
  cwd: TEST_DIR_FULL_PATH,
  stdio: 'pipe',
};

// Exported Mutable Variables
export let initialCommitHash: string;
export let INITIAL_FILE1_CONTENT: string;
export let INITIAL_FILE_TO_DELETE_CONTENT: string;
export let MODIFIED_FILE1_DELETIONS_CONTENT: string;

// Exported Functions
export const normalizeLineEndings = (str: string): string => {
  return str.replace(/\r\n/g, '\n');
};

export const resetToInitialState = (skipDeletionPatchResave = false) => {
  try {
    const currentBranch = execSync(
      'git rev-parse --abbrev-ref HEAD',
      execOptions,
    )
      .toString()
      .trim();
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
    console.error('Error resetting state:', (error as any).message);
    if ((error as any).stdout)
      console.error(
        'STDOUT (resetToInitialState):',
        (error as any).stdout.toString(),
      );
    if ((error as any).stderr)
      console.error(
        'STDERR (resetToInitialState):',
        (error as any).stderr.toString(),
      );
    throw error;
  }
};

export const applyDeletionsPatch = () => {
  execSync(`${TAYLORED_CMD_BASE} --add ${PLUGIN_DELETIONS_NAME}`, execOptions);
};

export const initializeTestEnvironment = async () => {
  console.log('Setting up test Git repository...');
  if (fs.existsSync(TEST_DIR_FULL_PATH)) {
    fs.rmSync(TEST_DIR_FULL_PATH, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR_FULL_PATH, { recursive: true });

  execSync('git init -b main', execOptions);
  execSync('git config user.email "test@example.com"', execOptions);
  execSync('git config user.name "Test User"', execOptions);
  execSync('git config commit.gpgsign false', execOptions);

  INITIAL_FILE1_CONTENT =
    'L1: Initial content for file1.\nL2: Line two.\nL3: Line three.\nL4: Line four.\nL5: Line five.\n';
  INITIAL_FILE_TO_DELETE_CONTENT = 'Content of file to be deleted.';
  fs.writeFileSync(
    path.join(TEST_DIR_FULL_PATH, 'file1.txt'),
    INITIAL_FILE1_CONTENT,
  );
  fs.writeFileSync(
    path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'),
    INITIAL_FILE_TO_DELETE_CONTENT,
  );
  execSync('git add file1.txt file_to_delete.txt', execOptions);
  execSync('git commit -m "Initial commit"', execOptions);
  initialCommitHash = execSync('git rev-parse HEAD', execOptions)
    .toString()
    .trim();

  execSync(`git checkout -b ${BRANCH_DELETIONS}`, execOptions);
  MODIFIED_FILE1_DELETIONS_CONTENT =
    'L1: Initial content for file1.\nL3: Line three.\nL5: Line five.\n'; // L2 and L4 deleted
  fs.writeFileSync(
    path.join(TEST_DIR_FULL_PATH, 'file1.txt'),
    MODIFIED_FILE1_DELETIONS_CONTENT,
  );
  if (fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))) {
    fs.rmSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'));
  }
  execSync('git add file1.txt file_to_delete.txt', execOptions);
  execSync(
    'git commit -m "Modify file1 and delete file_to_delete"',
    execOptions,
  );
  execSync('git checkout main', execOptions);

  if (!fs.existsSync(TAYLORED_DIR_FULL_PATH)) {
    fs.mkdirSync(TAYLORED_DIR_FULL_PATH, { recursive: true });
  }
  execSync(`${TAYLORED_CMD_BASE} --save ${BRANCH_DELETIONS}`, execOptions);
  if (!fs.existsSync(PLUGIN_DELETIONS_FULL_PATH)) {
    throw new Error(
      `Failed to create plugin file ${PLUGIN_DELETIONS_FULL_PATH} in initializeTestEnvironment`,
    );
  }
  console.log(
    `Test Git repository setup complete. Initial commit: ${initialCommitHash}. Patch ${PLUGIN_DELETIONS_NAME} created.`,
  );
};

export const cleanupTestEnvironment = async () => {
  console.log('Cleaning up...');
  // Ensure CWD is project root before removing test directory
  // This is handled by execOptions.cwd for git commands,
  // but fs.rmSync is global so good to be safe if CWD was changed elsewhere.
  // However, direct process.chdir might affect other parallel tests if any.
  // For now, relying on TEST_DIR_FULL_PATH being absolute.
  // process.chdir(PROJECT_ROOT_PATH); // Avoid global state changes if possible
  if (fs.existsSync(TEST_DIR_FULL_PATH)) {
    fs.rmSync(TEST_DIR_FULL_PATH, { recursive: true, force: true });
  }
  console.log('Cleanup complete.');
};

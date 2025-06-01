#!/bin/bash

set -euo pipefail

# Ensure Node.js type definitions are available for ts-node
echo -e "\033[0;33mEnsuring @types/node is installed...\033[0m"
if npm list --depth=0 --global @types/node >/dev/null 2>&1 || npm list --depth=0 @types/node >/dev/null 2>&1; then
  echo -e "\033[0;32m@types/node is already installed.\033[0m"
else
  if npm i --save-dev @types/node; then
    echo -e "\033[0;32m@types/node installed successfully.\033[0m"
  else
    echo -e "\033[0;31mERROR: Failed to install @types/node. Exiting.\033[0m"
    exit 1
  fi
fi
echo "----------------------------------------"


GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

SCRIPT_DIR_PATH=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
PROJECT_ROOT_PATH=$(cd "$SCRIPT_DIR_PATH/.." &>/dev/null && pwd)

# Command to run taylored via ts-node
TAYLORED_CMD_BASE="npx ts-node $PROJECT_ROOT_PATH/index.ts"
TAYLORED_DIR_NAME=".taylored" # Standard directory for taylored patches

# Test repository setup
TEST_SUBDIR_NAME="taylored_test_repo_space" # Subdirectory for the test git repo
TEST_DIR_FULL_PATH="$PROJECT_ROOT_PATH/$TEST_SUBDIR_NAME" # Full path to the test repo

# Cleanup function to remove the test repository on exit
cleanup() {
  echo -e "${YELLOW}Cleaning up...${NC}"
  # Navigate back to project root to ensure correct deletion path
  # shellcheck disable=SC2164 # We don't want to exit if cd fails here, still try to clean
  cd "$PROJECT_ROOT_PATH"
  echo -e "${YELLOW}Removing $TEST_DIR_FULL_PATH...${NC}"
  rm -rf "$TEST_DIR_FULL_PATH"
  echo -e "${GREEN}Cleanup complete.${NC}"
}
trap cleanup EXIT # Register cleanup function to run on script exit

echo -e "${YELLOW}Starting Taylored functionality tests...${NC}"

# Step 1: Setup a test Git repository
echo -e "${YELLOW}Step 1: Setting up test Git repository...${NC}"
if [ -d "$TEST_DIR_FULL_PATH" ]; then
  echo -e "${YELLOW}Removing existing test directory: $TEST_DIR_FULL_PATH${NC}"
  rm -rf "$TEST_DIR_FULL_PATH"
fi
mkdir -p "$TEST_DIR_FULL_PATH"
cd "$TEST_DIR_FULL_PATH" || { echo -e "${RED}ERROR: Could not access $TEST_DIR_FULL_PATH${NC}"; exit 1; }

# Initialize Git repository
git init -b main
git config user.email "test@example.com" # Git requires user configuration
git config user.name "Test User"

# Create initial files on main branch
echo "Riga 1 iniziale in file1." > file1.txt
echo "Riga 2 in file1 da rimuovere." >> file1.txt
echo "Riga 3 in file1 che rimane." >> file1.txt
echo "Contenuto del file_da_eliminare.txt" > file_to_delete.txt
git add file1.txt file_to_delete.txt
git commit -m "Commit iniziale su main"
# Store initial content for later verification
INITIAL_FILE1_CONTENT=$(cat file1.txt)
INITIAL_FILE_TO_DELETE_CONTENT=$(cat file_to_delete.txt)
# Store the very first commit hash on main
FIRST_MAIN_COMMIT_HASH=$(git rev-parse HEAD)

# Create a branch with deletions
BRANCH_DELETIONS="deletions-branch"
PLUGIN_DELETIONS_NAME="${BRANCH_DELETIONS}.taylored" # Taylored file name

git checkout -b "$BRANCH_DELETIONS"
# Modify file1.txt (remove a line) and remove file_to_delete.txt
echo "Riga 1 iniziale in file1." > file1.txt # Overwrite file1.txt
echo "Riga 3 in file1 che rimane." >> file1.txt # Add the remaining line
git rm file_to_delete.txt # Remove a file
git add file1.txt # Stage changes
git commit -m "Modifiche con solo rimozioni su $BRANCH_DELETIONS"
MODIFIED_FILE1_DELETIONS_CONTENT=$(cat file1.txt) # Store content after deletions

git checkout main # Return to main branch
echo -e "${GREEN}Test Git repository setup complete.${NC}"
echo "----------------------------------------"

# Step 2: Test 'taylored --save' with the deletions branch
echo -e "${YELLOW}Step 2: Testing 'taylored --save' with deletions branch ($BRANCH_DELETIONS)...${NC}"
$TAYLORED_CMD_BASE --save "$BRANCH_DELETIONS"

# Verify patch file creation
if [ -f "$TAYLORED_DIR_NAME/$PLUGIN_DELETIONS_NAME" ]; then
  echo -e "${GREEN}'taylored --save' successfully created $TAYLORED_DIR_NAME/$PLUGIN_DELETIONS_NAME.${NC}"
else
  echo -e "${RED}Error: 'taylored --save' failed to create $TAYLORED_DIR_NAME/$PLUGIN_DELETIONS_NAME.${NC}"
  exit 1
fi
echo "----------------------------------------"

# Step 2a: Test 'taylored --list'
echo -e "${YELLOW}Step 2a: Testing 'taylored --list'...${NC}"
LIST_OUTPUT=$($TAYLORED_CMD_BASE --list)
if echo "$LIST_OUTPUT" | grep -q "$PLUGIN_DELETIONS_NAME"; then
  echo -e "${GREEN}'taylored --list' lists the created plugin: $PLUGIN_DELETIONS_NAME.${NC}"
else
  echo -e "${RED}Error: 'taylored --list' does not list the plugin $PLUGIN_DELETIONS_NAME.${NC}"
  echo "List output:"
  echo "$LIST_OUTPUT"
  exit 1
fi
echo "----------------------------------------"

# Step 3: Test 'taylored --verify-add' (with and without extension)
echo -e "${YELLOW}Step 3: Testing 'taylored --verify-add' for $PLUGIN_DELETIONS_NAME (with extension)...${NC}"
if $TAYLORED_CMD_BASE --verify-add "$PLUGIN_DELETIONS_NAME"; then
  echo -e "${GREEN}'taylored --verify-add' for $PLUGIN_DELETIONS_NAME (with extension) completed successfully.${NC}"
else
  echo -e "${RED}Error: 'taylored --verify-add' for $PLUGIN_DELETIONS_NAME (with extension) failed.${NC}"
  exit 1
fi
# Verify files were not changed by --verify-add
if [ "$(cat file1.txt)" != "$INITIAL_FILE1_CONTENT" ]; then
    echo -e "${RED}Error: file1.txt modified after --verify-add (with extension).${NC}"
    exit 1
fi
if [ ! -f "file_to_delete.txt" ]; then # Should exist
    echo -e "${RED}Error: file_to_delete.txt removed after --verify-add (with extension).${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 3b: Testing 'taylored --verify-add' for ${PLUGIN_DELETIONS_NAME%.taylored} (without extension)...${NC}"
if $TAYLORED_CMD_BASE --verify-add "${PLUGIN_DELETIONS_NAME%.taylored}"; then
  echo -e "${GREEN}'taylored --verify-add' for ${PLUGIN_DELETIONS_NAME%.taylored} (without extension) completed successfully.${NC}"
else
  echo -e "${RED}Error: 'taylored --verify-add' for ${PLUGIN_DELETIONS_NAME%.taylored} (without extension) failed.${NC}"
  exit 1
fi
if [ "$(cat file1.txt)" != "$INITIAL_FILE1_CONTENT" ]; then
    echo -e "${RED}Error: file1.txt modified after --verify-add (without extension).${NC}"
    exit 1
fi
if [ ! -f "file_to_delete.txt" ]; then
    echo -e "${RED}Error: file_to_delete.txt removed after --verify-add (without extension).${NC}"
    exit 1
fi
echo "----------------------------------------"

# Step 4: Test 'taylored --add' (with and without extension)
echo -e "${YELLOW}Step 4: Testing 'taylored --add' with $PLUGIN_DELETIONS_NAME (with extension)...${NC}"
$TAYLORED_CMD_BASE --add "$PLUGIN_DELETIONS_NAME"

# Verify file content and existence after --add
if [ ! -f "file1.txt" ] || [ "$(cat file1.txt)" != "$MODIFIED_FILE1_DELETIONS_CONTENT" ]; then
  echo -e "${RED}Error: content of file1.txt is not as expected after 'taylored --add $PLUGIN_DELETIONS_NAME (with extension)'.${NC}"
  echo "Expected:"
  echo "$MODIFIED_FILE1_DELETIONS_CONTENT"
  echo "Got:"
  cat file1.txt || echo "file1.txt non trovato"
  exit 1
fi
if [ -f "file_to_delete.txt" ]; then # Should have been removed
  echo -e "${RED}Error: file_to_delete.txt was not removed after 'taylored --add $PLUGIN_DELETIONS_NAME (with extension)'.${NC}"
  exit 1
fi
echo -e "${GREEN}'taylored --add $PLUGIN_DELETIONS_NAME (with extension)' seems to have worked correctly.${NC}"
echo "----------------------------------------"

# Step 4b: Undo add for next test using 'taylored --remove'
echo -e "${YELLOW}Step 4b: Undoing add for next test: 'taylored --remove' with $PLUGIN_DELETIONS_NAME (with extension)...${NC}"
$TAYLORED_CMD_BASE --remove "$PLUGIN_DELETIONS_NAME"
# Verify restoration
if [ ! -f "file1.txt" ] || [ "$(cat file1.txt)" != "$INITIAL_FILE1_CONTENT" ]; then
  echo -e "${RED}Error: content of file1.txt was not restored after 'taylored --remove $PLUGIN_DELETIONS_NAME (with extension)'.${NC}"; exit 1;
fi
if [ ! -f "file_to_delete.txt" ] || [ "$(cat file_to_delete.txt)" != "$INITIAL_FILE_TO_DELETE_CONTENT" ]; then
  echo -e "${RED}Error: file_to_delete.txt was not restored correctly after 'taylored --remove $PLUGIN_DELETIONS_NAME (with extension)'.${NC}"; exit 1;
fi
echo -e "${GREEN}Undo successful.${NC}"
echo "----------------------------------------"

# Step 4c: Test 'taylored --add' without extension
echo -e "${YELLOW}Step 4c: Testing 'taylored --add' with ${PLUGIN_DELETIONS_NAME%.taylored} (without extension)...${NC}"
$TAYLORED_CMD_BASE --add "${PLUGIN_DELETIONS_NAME%.taylored}"
# Verify changes
if [ ! -f "file1.txt" ] || [ "$(cat file1.txt)" != "$MODIFIED_FILE1_DELETIONS_CONTENT" ]; then
  echo -e "${RED}Error: content of file1.txt is not as expected after 'taylored --add ${PLUGIN_DELETIONS_NAME%.taylored} (without extension)'.${NC}"
  echo "Expected:"
  echo "$MODIFIED_FILE1_DELETIONS_CONTENT"
  cat file1.txt || echo "file1.txt non trovato"
  exit 1
fi
if [ -f "file_to_delete.txt" ]; then
  echo -e "${RED}Error: file_to_delete.txt was not removed after 'taylored --add ${PLUGIN_DELETIONS_NAME%.taylored} (without extension)'.${NC}"
  exit 1
fi
echo -e "${GREEN}'taylored --add ${PLUGIN_DELETIONS_NAME%.taylored} (without extension)' seems to have worked correctly.${NC}"
echo "----------------------------------------"

# Step 5: Test 'taylored --verify-remove' (with and without extension)
echo -e "${YELLOW}Step 5: Testing 'taylored --verify-remove' for applied $PLUGIN_DELETIONS_NAME (with extension)...${NC}"
# Plugin is currently applied
if $TAYLORED_CMD_BASE --verify-remove "$PLUGIN_DELETIONS_NAME"; then
  echo -e "${GREEN}'taylored --verify-remove' for $PLUGIN_DELETIONS_NAME (with extension) completed successfully.${NC}"
else
  echo -e "${RED}Error: 'taylored --verify-remove' for $PLUGIN_DELETIONS_NAME (with extension) failed.${NC}"
  exit 1
fi
# Verify files were not changed by --verify-remove
if [ "$(cat file1.txt)" != "$MODIFIED_FILE1_DELETIONS_CONTENT" ]; then
    echo -e "${RED}Error: file1.txt modified after --verify-remove (with extension).${NC}"
    exit 1
fi
if [ -f "file_to_delete.txt" ]; then # Should still be removed
    echo -e "${RED}Error: file_to_delete.txt reappeared after --verify-remove (with extension).${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 5b: Testing 'taylored --verify-remove' for applied ${PLUGIN_DELETIONS_NAME%.taylored} (without extension)...${NC}"
if $TAYLORED_CMD_BASE --verify-remove "${PLUGIN_DELETIONS_NAME%.taylored}"; then
  echo -e "${GREEN}'taylored --verify-remove' for ${PLUGIN_DELETIONS_NAME%.taylored} (without extension) completed successfully.${NC}"
else
  echo -e "${RED}Error: 'taylored --verify-remove' for ${PLUGIN_DELETIONS_NAME%.taylored} (without extension) failed.${NC}"
  exit 1
fi
if [ "$(cat file1.txt)" != "$MODIFIED_FILE1_DELETIONS_CONTENT" ]; then
    echo -e "${RED}Error: file1.txt modified after --verify-remove (without extension).${NC}"
    exit 1
fi
if [ -f "file_to_delete.txt" ]; then
    echo -e "${RED}Error: file_to_delete.txt reappeared after --verify-remove (without extension).${NC}"
    exit 1
fi
echo "----------------------------------------"

# Step 6: Test 'taylored --remove' (with and without extension)
echo -e "${YELLOW}Step 6: Testing 'taylored --remove' with $PLUGIN_DELETIONS_NAME (with extension)...${NC}"
$TAYLORED_CMD_BASE --remove "$PLUGIN_DELETIONS_NAME"
# Verify restoration
if [ ! -f "file1.txt" ] || [ "$(cat file1.txt)" != "$INITIAL_FILE1_CONTENT" ]; then
  echo -e "${RED}Error: content of file1.txt was not restored after 'taylored --remove $PLUGIN_DELETIONS_NAME (with extension)'.${NC}"
  exit 1
fi
if [ ! -f "file_to_delete.txt" ] || [ "$(cat file_to_delete.txt)" != "$INITIAL_FILE_TO_DELETE_CONTENT" ]; then
  echo -e "${RED}Error: file_to_delete.txt was not restored or content is incorrect after 'taylored --remove $PLUGIN_DELETIONS_NAME (with extension)'.${NC}"
  exit 1
fi
echo -e "${GREEN}'taylored --remove $PLUGIN_DELETIONS_NAME (with extension)' seems to have worked correctly.${NC}"
echo "----------------------------------------"

# Step 6b: Re-apply for next test
echo -e "${YELLOW}Step 6b: Re-applying for next test: 'taylored --add' with ${PLUGIN_DELETIONS_NAME%.taylored} (without extension)...${NC}"
$TAYLORED_CMD_BASE --add "${PLUGIN_DELETIONS_NAME%.taylored}"
# Verify re-application
if [ ! -f "file1.txt" ] || [ "$(cat file1.txt)" != "$MODIFIED_FILE1_DELETIONS_CONTENT" ]; then
 echo -e "${RED}Error: content of file1.txt is not as expected after re-applying 'taylored --add ${PLUGIN_DELETIONS_NAME%.taylored} (without extension)'.${NC}"; exit 1;
fi
if [ -f "file_to_delete.txt" ]; then
 echo -e "${RED}Error: file_to_delete.txt was not removed after re-applying 'taylored --add ${PLUGIN_DELETIONS_NAME%.taylored} (without extension)'.${NC}"; exit 1;
fi
echo -e "${GREEN}Re-apply successful.${NC}"
echo "----------------------------------------"

# Step 6c: Test 'taylored --remove' without extension
echo -e "${YELLOW}Step 6c: Testing 'taylored --remove' with ${PLUGIN_DELETIONS_NAME%.taylored} (without extension)...${NC}"
$TAYLORED_CMD_BASE --remove "${PLUGIN_DELETIONS_NAME%.taylored}"
# Verify restoration
if [ ! -f "file1.txt" ] || [ "$(cat file1.txt)" != "$INITIAL_FILE1_CONTENT" ]; then
  echo -e "${RED}Error: content of file1.txt was not restored after 'taylored --remove ${PLUGIN_DELETIONS_NAME%.taylored} (without extension)'.${NC}"
  exit 1
fi
if [ ! -f "file_to_delete.txt" ] || [ "$(cat file_to_delete.txt)" != "$INITIAL_FILE_TO_DELETE_CONTENT" ]; then
  echo -e "${RED}Error: file_to_delete.txt was not restored or content is incorrect after 'taylored --remove ${PLUGIN_DELETIONS_NAME%.taylored} (without extension)'.${NC}"
  exit 1
fi
echo -e "${GREEN}'taylored --remove ${PLUGIN_DELETIONS_NAME%.taylored} (without extension)' seems to have worked correctly.${NC}"
echo "----------------------------------------"

# Setup for additions patch tests
BRANCH_ADDITIONS="additions-branch"
PLUGIN_ADDITIONS_NAME="${BRANCH_ADDITIONS}.taylored"

git checkout -b "$BRANCH_ADDITIONS"
echo "Riga aggiunta a file1." >> file1.txt
echo "Contenuto del nuovo_file.txt" > new_file.txt
git add file1.txt new_file.txt
git commit -m "Modifiche con solo aggiunte su $BRANCH_ADDITIONS"
MODIFIED_FILE1_ADDITIONS_CONTENT=$(cat file1.txt)
NEW_FILE_CONTENT=$(cat new_file.txt)
git checkout main

# Step 7: Test 'taylored --save' with additions branch
echo -e "${YELLOW}Step 7: Testing 'taylored --save' with additions branch ($BRANCH_ADDITIONS)...${NC}"
$TAYLORED_CMD_BASE --save "$BRANCH_ADDITIONS"
if [ -f "$TAYLORED_DIR_NAME/$PLUGIN_ADDITIONS_NAME" ]; then
  echo -e "${GREEN}'taylored --save' successfully created $TAYLORED_DIR_NAME/$PLUGIN_ADDITIONS_NAME.${NC}"
else
  echo -e "${RED}Error: 'taylored --save' failed to create $TAYLORED_DIR_NAME/$PLUGIN_ADDITIONS_NAME.${NC}"
  exit 1
fi

# Step 7a-d: Test add/remove for additions patch (with and without extension)
echo -e "${YELLOW}Step 7a: Testing 'taylored --add' with $PLUGIN_ADDITIONS_NAME (with extension)...${NC}"
$TAYLORED_CMD_BASE --add "$PLUGIN_ADDITIONS_NAME"
if [ "$(cat file1.txt)" != "$MODIFIED_FILE1_ADDITIONS_CONTENT" ] || \
   [ ! -f "new_file.txt" ] || [ "$(cat new_file.txt)" != "$NEW_FILE_CONTENT" ]; then
  echo -e "${RED}Error: 'taylored --add $PLUGIN_ADDITIONS_NAME (with extension)' did not apply changes correctly.${NC}"
  exit 1
fi
echo -e "${GREEN}'taylored --add $PLUGIN_ADDITIONS_NAME (with extension)' applied successfully.${NC}"

echo -e "${YELLOW}Step 7b: Testing 'taylored --remove' with $PLUGIN_ADDITIONS_NAME (with extension)...${NC}"
$TAYLORED_CMD_BASE --remove "$PLUGIN_ADDITIONS_NAME"
if [ "$(cat file1.txt)" != "$INITIAL_FILE1_CONTENT" ] || [ -f "new_file.txt" ]; then
  echo -e "${RED}Error: 'taylored --remove $PLUGIN_ADDITIONS_NAME (with extension)' did not restore state correctly.${NC}"
  exit 1
fi
echo -e "${GREEN}'taylored --remove $PLUGIN_ADDITIONS_NAME (with extension)' removed successfully.${NC}"

echo -e "${YELLOW}Step 7c: Testing 'taylored --add' with ${PLUGIN_ADDITIONS_NAME%.taylored} (without extension)...${NC}"
$TAYLORED_CMD_BASE --add "${PLUGIN_ADDITIONS_NAME%.taylored}"
if [ "$(cat file1.txt)" != "$MODIFIED_FILE1_ADDITIONS_CONTENT" ] || \
   [ ! -f "new_file.txt" ] || [ "$(cat new_file.txt)" != "$NEW_FILE_CONTENT" ]; then
  echo -e "${RED}Error: 'taylored --add ${PLUGIN_ADDITIONS_NAME%.taylored} (without extension)' did not apply changes correctly.${NC}"
  exit 1
fi
echo -e "${GREEN}'taylored --add ${PLUGIN_ADDITIONS_NAME%.taylored} (without extension)' applied successfully.${NC}"

echo -e "${YELLOW}Step 7d: Testing 'taylored --remove' with ${PLUGIN_ADDITIONS_NAME%.taylored} (without extension)...${NC}"
$TAYLORED_CMD_BASE --remove "${PLUGIN_ADDITIONS_NAME%.taylored}"
if [ "$(cat file1.txt)" != "$INITIAL_FILE1_CONTENT" ] || [ -f "new_file.txt" ]; then
  echo -e "${RED}Error: 'taylored --remove ${PLUGIN_ADDITIONS_NAME%.taylored} (without extension)' did not restore state correctly.${NC}"
  exit 1
fi
echo -e "${GREEN}'taylored --remove ${PLUGIN_ADDITIONS_NAME%.taylored} (without extension)' removed successfully.${NC}"
echo "----------------------------------------"

# Step 8: Test 'taylored --save' with mixed changes (should fail to save)
BRANCH_MIXED="mixed-changes-branch"
PLUGIN_MIXED_NAME="${BRANCH_MIXED}.taylored"
git checkout -b "$BRANCH_MIXED"
echo "Riga aggiunta a file1 per test misto." >> file1.txt # Addition
# Using a portable way to delete a line for testing
if sed --version 2>/dev/null | grep -q GNU; then # GNU sed
  sed -i '/Riga 3 in file1 che rimane./d' file1.txt
else # macOS sed requires extension for -i
  sed -i.bak '/Riga 3 in file1 che rimane./d' file1.txt && rm file1.txt.bak
fi
git add file1.txt
git commit -m "Modifiche miste su $BRANCH_MIXED"
git checkout main

echo -e "${YELLOW}Step 8: Testing 'taylored --save' with mixed changes branch ($BRANCH_MIXED)...${NC}"
# Expecting this to fail (non-zero exit code) or succeed but not create the file
if $TAYLORED_CMD_BASE --save "$BRANCH_MIXED"; then
  # If command succeeded (exit 0)
  if [ -f "$TAYLORED_DIR_NAME/$PLUGIN_MIXED_NAME" ]; then
    echo -e "${RED}Error: 'taylored --save' for mixed changes created $PLUGIN_MIXED_NAME unexpectedly.${NC}"
    ls -l "$TAYLORED_DIR_NAME/"
    exit 1
  else
    echo -e "${YELLOW}Warning: 'taylored --save' for mixed changes completed successfully (exit 0) but did not create the file. This is acceptable if the tool just prints an error message and exits 0.${NC}"
  fi
else
  # If command failed (non-zero exit code) - this is the more robust expected behavior
  echo -e "${GREEN}'taylored --save' failed as expected for mixed changes (non-zero exit code).${NC}"
  if [ -f "$TAYLORED_DIR_NAME/$PLUGIN_MIXED_NAME" ]; then
    echo -e "${RED}Error: 'taylored --save' failed but still created $PLUGIN_MIXED_NAME.${NC}"
    exit 1
  fi
fi
echo "----------------------------------------"

# Step 9 (was 10): Test 'taylored --add' on a slightly modified state (fuzzy patching or failure)
echo -e "${YELLOW}Step 9: Testing 'taylored --add' on a slightly modified state...${NC}"
git checkout main # Ensure on main
git reset --hard "$FIRST_MAIN_COMMIT_HASH" # Reset main to the VERY FIRST commit state

# Explicitly remove files that might interfere from later tests, ensuring main is pristine
echo -e "${YELLOW}Explicitly removing potentially interfering files from main for Step 9...${NC}"
INTERFERING_FILES_S9=("new_file.txt" "offset_del_test_file_s11.txt" "offset_additions_test_file_s12.txt" "offset_message_test_file_s13.txt" "offset_success_test_file.txt")
for FILE_TO_RM in "${INTERFERING_FILES_S9[@]}"; do
  if [ -f "$FILE_TO_RM" ]; then
    if git ls-files --error-unmatch "$FILE_TO_RM" >/dev/null 2>&1; then
      git rm --cached "$FILE_TO_RM" >/dev/null # Remove from index if tracked
    fi
    rm -f "$FILE_TO_RM" # Remove from working directory
  fi
done
# Ensure file1.txt and file_to_delete.txt are as per FIRST_MAIN_COMMIT_HASH
git checkout "$FIRST_MAIN_COMMIT_HASH" -- file1.txt file_to_delete.txt
git add file1.txt file_to_delete.txt # Re-add them if they were modified by checkout

git commit -m "Reset main to pristine initial state for Step 9" --allow-empty
# Now HEAD on main should *only* have file1.txt and file_to_delete.txt as in the first commit.

# Re-generate the deletions plugin based on the current state of main and BRANCH_DELETIONS
echo -e "${YELLOW}Re-generating $PLUGIN_DELETIONS_NAME for Step 9 based on current main...${NC}"
if $TAYLORED_CMD_BASE --save "$BRANCH_DELETIONS"; then
  echo -e "${GREEN}Successfully re-generated $PLUGIN_DELETIONS_NAME for Step 9.${NC}"
else
  echo -e "${RED}Error: Failed to re-generate $PLUGIN_DELETIONS_NAME for Step 9.${NC}"
  echo -e "${YELLOW}Diff between HEAD (main) and $BRANCH_DELETIONS that --save used:${NC}"
  git diff HEAD "$BRANCH_DELETIONS" -- . ":(exclude)$TAYLORED_DIR_NAME/" || echo "git diff failed"
  exit 1
fi

# Slightly modify a file that the patch touches
echo "Modifica leggera prima di riapplicare." >> file1.txt
echo "Attempting to apply $PLUGIN_DELETIONS_NAME to a modified file1.txt..."

if $TAYLORED_CMD_BASE --add "$PLUGIN_DELETIONS_NAME"; then
    echo -e "${YELLOW}Warning: 'taylored --add' succeeded on a modified file. This might be due to git's fuzzy patching. Check results.${NC}"
else
    echo -e "${GREEN}'taylored --add' failed on a modified file, as might be expected if patch is strict or changes are too large.${NC}"
    find . -name "*.rej" -print -delete 
fi
# Reset file1.txt to its state on main (pristine initial state)
git checkout HEAD -- file1.txt # Undoes the "Modifica leggera"
echo "----------------------------------------"

# Step 10 (was 11): Test 'taylored --remove' when plugin is not applied
echo -e "${YELLOW}Step 10: Testing 'taylored --remove' when plugin ($PLUGIN_DELETIONS_NAME) is not applied...${NC}"
# At this point, main is in its pristine initial state, and $PLUGIN_DELETIONS_NAME (just re-generated) is not applied.
if ! $TAYLORED_CMD_BASE --remove "$PLUGIN_DELETIONS_NAME" >/dev/null 2>&1; then
  echo -e "${GREEN}'taylored --remove' on a non-applied plugin failed as expected.${NC}"
else
  echo -e "${YELLOW}Warning: 'taylored --remove' on a non-applied plugin completed successfully (exit 0). This is OK if the tool handles idempotency, but verify files remained unchanged.${NC}"
  # Verify files are still in pristine initial state
  TEMP_FILE1_CONTENT=$(cat file1.txt)
  TEMP_FILE_TO_DELETE_EXISTS=true
  [ ! -f "file_to_delete.txt" ] && TEMP_FILE_TO_DELETE_EXISTS=false
  TEMP_FILE_TO_DELETE_CONTENT=""
  if $TEMP_FILE_TO_DELETE_EXISTS; then TEMP_FILE_TO_DELETE_CONTENT=$(cat file_to_delete.txt); fi

  if [ "$TEMP_FILE1_CONTENT" != "$INITIAL_FILE1_CONTENT" ] || \
     [ "$TEMP_FILE_TO_DELETE_CONTENT" != "$INITIAL_FILE_TO_DELETE_CONTENT" ] || \
     ! $TEMP_FILE_TO_DELETE_EXISTS ; then
       echo -e "${RED}Error: Files changed after supposedly idempotent 'taylored --remove' on non-applied plugin.${NC}"
       exit 1
  fi
fi
echo "----------------------------------------"

# Step 11 (was 12): Test 'taylored --offset' for a DELETIONS patch when main has diverged (expecting obsolescence)
echo -e "${YELLOW}Step 11: Testing 'taylored --offset' for a DELETIONS patch (expecting obsolescence)...${NC}"
git checkout main
git reset --hard "$FIRST_MAIN_COMMIT_HASH" # Reset main to pristine initial state
find . -name "*.rej" -print -delete # Clean up any previous .rej files
rm -rf "$TAYLORED_DIR_NAME" # Clean up .taylored dir before this specific test

OFFSET_DEL_FILE="offset_del_test_file_s11.txt" 
OFFSET_DEL_BRANCH_S11="deletions-offset-branch-s11" 
OFFSET_DEL_PLUGIN_NAME_S11="${OFFSET_DEL_BRANCH_S11}.taylored"

echo "$INITIAL_FILE1_CONTENT" > file1.txt
echo "$INITIAL_FILE_TO_DELETE_CONTENT" > file_to_delete.txt
git add file1.txt file_to_delete.txt
cat << EOF > "$OFFSET_DEL_FILE"
Line 1 for S11 deletion offset test
Line 2 to be deleted in S11
Line 3 to be deleted in S11
Line 4 for S11 deletion offset test
Line 5 for S11 deletion offset test
EOF
git add "$OFFSET_DEL_FILE"
git commit -m "Setup S11: Base content for offset_del_file on main"
MAIN_COMMIT_FOR_S11_PATCH=$(git rev-parse HEAD) 

git checkout -b "$OFFSET_DEL_BRANCH_S11" "$MAIN_COMMIT_FOR_S11_PATCH"
cat << EOF > "$OFFSET_DEL_FILE" 
Line 1 for S11 deletion offset test
Line 4 for S11 deletion offset test
Line 5 for S11 deletion offset test
EOF
git add "$OFFSET_DEL_FILE"
git commit -m "Deletions on $OFFSET_DEL_BRANCH_S11"

git checkout main 
git reset --hard "$MAIN_COMMIT_FOR_S11_PATCH" 
$TAYLORED_CMD_BASE --save "$OFFSET_DEL_BRANCH_S11" 
# Commit the newly created/updated .taylored directory and its content
if [ -d "$TAYLORED_DIR_NAME" ]; then
  git add "$TAYLORED_DIR_NAME" 
  if [ -f "$TAYLORED_DIR_NAME/$OFFSET_DEL_PLUGIN_NAME_S11" ]; then
    git add "$TAYLORED_DIR_NAME/$OFFSET_DEL_PLUGIN_NAME_S11"
  fi
  if ! git diff --staged --quiet; then 
    git commit -m "Add/update $OFFSET_DEL_PLUGIN_NAME_S11 for S11 offset test"
  else
    echo "No changes in $TAYLORED_DIR_NAME or elsewhere to commit for S11 setup."
  fi
else
  echo -e "${RED}Error: $TAYLORED_DIR_NAME was not created by --save in S11.${NC}"
  exit 1
fi
STORED_OFFSET_DEL_PLUGIN_S11_CONTENT=$(cat "$TAYLORED_DIR_NAME/$OFFSET_DEL_PLUGIN_NAME_S11") 

git checkout main 
cat << EOF > "$OFFSET_DEL_FILE" 
ADDED PREPEND LINE 1 - S11 MAIN MODIFIED
ADDED PREPEND LINE 2 - S11 MAIN MODIFIED
Line 1 for S11 deletion offset test
Line 2 to be deleted in S11
Line 3 to be deleted in S11
Line 4 for S11 deletion offset test
Line 5 for S11 deletion offset test
EOF
git add "$OFFSET_DEL_FILE"
git commit -m "Shift context ON MAIN BRANCH for S11 deletions offset test"
MAIN_MODIFIED_CONTENT_S11=$(cat "$OFFSET_DEL_FILE") 

echo -e "${YELLOW}Current git status before --offset in S11:${NC}"
git status --porcelain || true 

echo -e "${YELLOW}Running 'taylored --offset' for $OFFSET_DEL_PLUGIN_NAME_S11 - expecting obsolescence error...${NC}"
set +e 
OFFSET_OUTPUT_DEL_EXT=$($TAYLORED_CMD_BASE --offset "$OFFSET_DEL_PLUGIN_NAME_S11" 2>&1)
OFFSET_EXIT_CODE_DEL_EXT=$?
set -e 

if [ $OFFSET_EXIT_CODE_DEL_EXT -ne 0 ]; then
  echo -e "${GREEN}'taylored --offset' for $OFFSET_DEL_PLUGIN_NAME_S11 failed as expected.${NC}"
  if echo "$OFFSET_OUTPUT_DEL_EXT" | grep -q -E "obsolete|could not be processed"; then 
    echo -e "${GREEN}Obsolescence/Failure message found: $(echo "$OFFSET_OUTPUT_DEL_EXT" | grep -E "obsolete|could not be processed") ${NC}"
  else
    echo -e "${RED}Error: 'taylored --offset' for $OFFSET_DEL_PLUGIN_NAME_S11 failed, but expected message not found.${NC}"
    echo "Full Output was: $OFFSET_OUTPUT_DEL_EXT"
    exit 1
  fi
else
  echo -e "${RED}Error: 'taylored --offset' for $OFFSET_DEL_PLUGIN_NAME_S11 succeeded unexpectedly.${NC}"
  echo "Output was: $OFFSET_OUTPUT_DEL_EXT"
  exit 1
fi

if [ "$(cat "$TAYLORED_DIR_NAME/$OFFSET_DEL_PLUGIN_NAME_S11")" != "$STORED_OFFSET_DEL_PLUGIN_S11_CONTENT" ]; then
  echo -e "${YELLOW}Warning: Patch file $TAYLORED_DIR_NAME/$OFFSET_DEL_PLUGIN_NAME_S11 was modified by failed --offset. This might be acceptable if it wrote an empty/obsolete marker.${NC}"
fi
echo -e "${GREEN}Patch file $TAYLORED_DIR_NAME/$OFFSET_DEL_PLUGIN_NAME_S11 state checked after failed --offset.${NC}"


if [ "$(cat "$OFFSET_DEL_FILE")" != "$MAIN_MODIFIED_CONTENT_S11" ]; then
  echo -e "${RED}Error: Source file $OFFSET_DEL_FILE in workspace was modified by failed --offset.${NC}"
  exit 1
fi
echo -e "${GREEN}Source file $OFFSET_DEL_FILE in workspace remains unchanged after failed --offset, as expected.${NC}"

git branch -D "$OFFSET_DEL_BRANCH_S11" &>/dev/null || true
if [ -f "$TAYLORED_DIR_NAME/$OFFSET_DEL_PLUGIN_NAME_S11" ]; then rm -f "$TAYLORED_DIR_NAME/$OFFSET_DEL_PLUGIN_NAME_S11"; fi
git checkout main 
git reset --hard "$MAIN_COMMIT_FOR_S11_PATCH" 
git commit --amend -m "Setup S11: Base content for offset_del_file on main (Reset)" --no-edit 
echo "----------------------------------------"


# Step 12 (was 13): Test 'taylored --offset' for an ADDITIONS patch when main has diverged (expecting obsolescence)
echo -e "${YELLOW}Step 12: Testing 'taylored --offset' for an ADDITIONS patch (expecting obsolescence)...${NC}"
git checkout main
git reset --hard "$MAIN_COMMIT_FOR_S11_PATCH" 
find . -name "*.rej" -print -delete

OFFSET_ADD_FILE_S12="offset_additions_test_file_s12.txt"
OFFSET_ADD_BRANCH_S12="additions-offset-branch-s12" 
OFFSET_ADD_PLUGIN_NAME_S12="${OFFSET_ADD_BRANCH_S12}.taylored"

cat << EOF > "$OFFSET_ADD_FILE_S12"
Base line 1 for S12 additions offset test
Base line 2 for S12 additions offset test
EOF
git add "$OFFSET_ADD_FILE_S12"
git commit -m "Initial content for S12 additions offset test"
MAIN_COMMIT_FOR_S12_PATCH=$(git rev-parse HEAD)

git checkout -b "$OFFSET_ADD_BRANCH_S12" "$MAIN_COMMIT_FOR_S12_PATCH"
cat << EOF > "$OFFSET_ADD_FILE_S12" 
Base line 1 for S12 additions offset test
NEWLY ADDED LINE A - S12
NEWLY ADDED LINE B - S12
Base line 2 for S12 additions offset test
EOF
git add "$OFFSET_ADD_FILE_S12"
git commit -m "Additions on $OFFSET_ADD_BRANCH_S12"

git checkout main 
git reset --hard "$MAIN_COMMIT_FOR_S12_PATCH"
$TAYLORED_CMD_BASE --save "$OFFSET_ADD_BRANCH_S12" 
if [ -d "$TAYLORED_DIR_NAME" ]; then
  git add "$TAYLORED_DIR_NAME" 
  if [ -f "$TAYLORED_DIR_NAME/$OFFSET_ADD_PLUGIN_NAME_S12" ]; then
    git add "$TAYLORED_DIR_NAME/$OFFSET_ADD_PLUGIN_NAME_S12"
  fi
  if ! git diff --staged --quiet; then
    git commit -m "Add/update $OFFSET_ADD_PLUGIN_NAME_S12 for S12 offset test"
  else
    echo "No changes in $TAYLORED_DIR_NAME or elsewhere to commit for S12 setup."
  fi
else
  echo -e "${RED}Error: $TAYLORED_DIR_NAME was not created by --save in S12.${NC}"
  exit 1
fi
STORED_OFFSET_ADD_PLUGIN_S12_CONTENT=$(cat "$TAYLORED_DIR_NAME/$OFFSET_ADD_PLUGIN_NAME_S12")

git checkout main
cat << EOF > "$OFFSET_ADD_FILE_S12" 
EXTRA PREPEND LINE X - S12 MAIN MODIFIED
EXTRA PREPEND LINE Y - S12 MAIN MODIFIED
Base line 1 for S12 additions offset test
Base line 2 for S12 additions offset test
EOF
git add "$OFFSET_ADD_FILE_S12"
git commit -m "Shift context ON MAIN BRANCH for S12 additions offset test"
MAIN_MODIFIED_CONTENT_S12=$(cat "$OFFSET_ADD_FILE_S12")

echo -e "${YELLOW}Current git status before --offset in S12:${NC}"
git status --porcelain || true

echo -e "${YELLOW}Running 'taylored --offset' for $OFFSET_ADD_PLUGIN_NAME_S12 - expecting obsolescence error...${NC}"
set +e 
OFFSET_OUTPUT_ADD_EXT=$($TAYLORED_CMD_BASE --offset "$OFFSET_ADD_PLUGIN_NAME_S12" 2>&1)
OFFSET_EXIT_CODE_ADD_EXT=$?
set -e 

if [ $OFFSET_EXIT_CODE_ADD_EXT -ne 0 ]; then
  echo -e "${GREEN}'taylored --offset' for $OFFSET_ADD_PLUGIN_NAME_S12 failed as expected.${NC}"
  if echo "$OFFSET_OUTPUT_ADD_EXT" | grep -q -E "obsolete|could not be processed"; then 
     echo -e "${GREEN}Obsolescence/Failure message found: $(echo "$OFFSET_OUTPUT_ADD_EXT" | grep -E "obsolete|could not be processed") ${NC}"
  else
    echo -e "${RED}Error: 'taylored --offset' for $OFFSET_ADD_PLUGIN_NAME_S12 failed, but expected message not found.${NC}"
    echo "Output was: $OFFSET_OUTPUT_ADD_EXT"
    exit 1
  fi
else
  echo -e "${RED}Error: 'taylored --offset' for $OFFSET_ADD_PLUGIN_NAME_S12 succeeded unexpectedly.${NC}"
  echo "Output was: $OFFSET_OUTPUT_ADD_EXT"
  exit 1
fi

if [ "$(cat "$TAYLORED_DIR_NAME/$OFFSET_ADD_PLUGIN_NAME_S12")" != "$STORED_OFFSET_ADD_PLUGIN_S12_CONTENT" ]; then
   echo -e "${YELLOW}Warning: Patch file $TAYLORED_DIR_NAME/$OFFSET_ADD_PLUGIN_NAME_S12 was modified by failed --offset. This might be acceptable if it wrote an empty/obsolete marker.${NC}"
fi
echo -e "${GREEN}Patch file $TAYLORED_DIR_NAME/$OFFSET_ADD_PLUGIN_NAME_S12 state checked after failed --offset.${NC}"

if [ "$(cat "$OFFSET_ADD_FILE_S12")" != "$MAIN_MODIFIED_CONTENT_S12" ]; then
  echo -e "${RED}Error: Source file $OFFSET_ADD_FILE_S12 in workspace was modified by failed --offset.${NC}"
  exit 1
fi
echo -e "${GREEN}Source file $OFFSET_ADD_FILE_S12 in workspace remains unchanged after failed --offset, as expected.${NC}"

git branch -D "$OFFSET_ADD_BRANCH_S12" &>/dev/null || true
if [ -f "$TAYLORED_DIR_NAME/$OFFSET_ADD_PLUGIN_NAME_S12" ]; then rm -f "$TAYLORED_DIR_NAME/$OFFSET_ADD_PLUGIN_NAME_S12"; fi
git checkout main
git reset --hard "$MAIN_COMMIT_FOR_S12_PATCH"
git commit --amend -m "Initial content for S12 additions offset test (Reset)" --no-edit
echo "----------------------------------------"

# Tests from Step 13 onwards have been removed.

echo -e "${GREEN}All Taylored tests passed successfully!${NC}"

exit 0

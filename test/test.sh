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
STORED_OFFSET_DEL_PLUGIN_S11_CONTENT=$(cat "$TAYLORED_DIR_NAME/$OFFSET_DEL_PLUGIN_NAME_S11") 

git checkout main 
git reset --hard "$MAIN_COMMIT_FOR_S11_PATCH" 
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
  echo -e "${RED}Error: Patch file $TAYLORED_DIR_NAME/$OFFSET_DEL_PLUGIN_NAME_S11 was modified by failed --offset.${NC}"
  exit 1
fi
echo -e "${GREEN}Patch file $TAYLORED_DIR_NAME/$OFFSET_DEL_PLUGIN_NAME_S11 remains unchanged after failed --offset, as expected.${NC}"

if [ "$(cat "$OFFSET_DEL_FILE")" != "$MAIN_MODIFIED_CONTENT_S11" ]; then
  echo -e "${RED}Error: Source file $OFFSET_DEL_FILE in workspace was modified by failed --offset.${NC}"
  exit 1
fi
echo -e "${GREEN}Source file $OFFSET_DEL_FILE in workspace remains unchanged after failed --offset, as expected.${NC}"

git branch -D "$OFFSET_DEL_BRANCH_S11" &>/dev/null || true
rm -f "$TAYLORED_DIR_NAME/$OFFSET_DEL_PLUGIN_NAME_S11"
git checkout main 
git reset --hard "$MAIN_COMMIT_FOR_S11_PATCH" 
git commit --amend -m "Setup S11: Base content for offset_del_file on main (Reset)" --no-edit 
echo "----------------------------------------"


# Step 12 (was 13): Test 'taylored --offset' for an ADDITIONS patch when main has diverged (expecting obsolescence)
echo -e "${YELLOW}Step 12: Testing 'taylored --offset' for an ADDITIONS patch (expecting obsolescence)...${NC}"
git checkout main
git reset --hard HEAD 

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
STORED_OFFSET_ADD_PLUGIN_S12_CONTENT=$(cat "$TAYLORED_DIR_NAME/$OFFSET_ADD_PLUGIN_NAME_S12")

git checkout main
git reset --hard "$MAIN_COMMIT_FOR_S12_PATCH"
cat << EOF > "$OFFSET_ADD_FILE_S12" 
EXTRA PREPEND LINE X - S12 MAIN MODIFIED
EXTRA PREPEND LINE Y - S12 MAIN MODIFIED
Base line 1 for S12 additions offset test
Base line 2 for S12 additions offset test
EOF
git add "$OFFSET_ADD_FILE_S12"
git commit -m "Shift context ON MAIN BRANCH for S12 additions offset test"
MAIN_MODIFIED_CONTENT_S12=$(cat "$OFFSET_ADD_FILE_S12")

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
  echo -e "${RED}Error: Patch file $TAYLORED_DIR_NAME/$OFFSET_ADD_PLUGIN_NAME_S12 was modified by failed --offset.${NC}"
  exit 1
fi
echo -e "${GREEN}Patch file $TAYLORED_DIR_NAME/$OFFSET_ADD_PLUGIN_NAME_S12 remains unchanged after failed --offset, as expected.${NC}"

if [ "$(cat "$OFFSET_ADD_FILE_S12")" != "$MAIN_MODIFIED_CONTENT_S12" ]; then
  echo -e "${RED}Error: Source file $OFFSET_ADD_FILE_S12 in workspace was modified by failed --offset.${NC}"
  exit 1
fi
echo -e "${GREEN}Source file $OFFSET_ADD_FILE_S12 in workspace remains unchanged after failed --offset, as expected.${NC}"

git branch -D "$OFFSET_ADD_BRANCH_S12" &>/dev/null || true
rm -f "$TAYLORED_DIR_NAME/$OFFSET_ADD_PLUGIN_NAME_S12"
git checkout main
git reset --hard "$MAIN_COMMIT_FOR_S12_PATCH"
git commit --amend -m "Initial content for S12 additions offset test (Reset)" --no-edit
echo "----------------------------------------"


# Step 13 (was 14): Test 'taylored --offset NAME --message "CUSTOM"' and 'taylored --data NAME'
echo -e "${YELLOW}Step 13: Testing 'taylored --offset' with '--message' and '--data'...${NC}"
git checkout main
git reset --hard "$FIRST_MAIN_COMMIT_HASH"

OFFSET_MSG_FILE_S13="offset_message_test_file_s13.txt"
OFFSET_MSG_BRANCH_S13="message-offset-branch-s13" 
OFFSET_MSG_PLUGIN_NAME_S13="${OFFSET_MSG_BRANCH_S13}.taylored"
CUSTOM_MESSAGE_S13="My Custom Subject S13"
EXPECTED_SUBJECT_LINE_S13="Subject: [PATCH] $CUSTOM_MESSAGE_S13"

# 13a. Setup for successful offset update with a custom message
echo "Linea base per S13." > "$OFFSET_MSG_FILE_S13"
git add "$OFFSET_MSG_FILE_S13"
git commit -m "File base per S13 --offset --message"
MAIN_COMMIT_S13_MSG_TEST=$(git rev-parse HEAD)

git checkout -b "$OFFSET_MSG_BRANCH_S13" "$MAIN_COMMIT_S13_MSG_TEST"
echo "Aggiunta su branch per S13." >> "$OFFSET_MSG_FILE_S13"
git add "$OFFSET_MSG_FILE_S13"
git commit -m "Modifiche su $OFFSET_MSG_BRANCH_S13"

git checkout main
git reset --hard "$MAIN_COMMIT_S13_MSG_TEST"
$TAYLORED_CMD_BASE --save "$OFFSET_MSG_BRANCH_S13" # Save initial patch (no subject line from --save)

# 13b. Run --offset with --message (expecting success and message embedding)
echo -e "${YELLOW}Running 'taylored --offset $OFFSET_MSG_PLUGIN_NAME_S13 --message \"$CUSTOM_MESSAGE_S13\"'...${NC}"
set +e
OFFSET_MSG_OUTPUT_S13=$($TAYLORED_CMD_BASE --offset "$OFFSET_MSG_PLUGIN_NAME_S13" --message "$CUSTOM_MESSAGE_S13" 2>&1)
OFFSET_MSG_EXIT_CODE_S13=$?
set -e

if [ $OFFSET_MSG_EXIT_CODE_S13 -eq 0 ]; then
  echo -e "${GREEN}'taylored --offset' with --message succeeded as expected.${NC}"
  if ! grep -q "$EXPECTED_SUBJECT_LINE_S13" "$TAYLORED_DIR_NAME/$OFFSET_MSG_PLUGIN_NAME_S13"; then
    echo -e "${RED}Error: Expected Subject line not found in $OFFSET_MSG_PLUGIN_NAME_S13.${NC}"
    echo "Expected to find: $EXPECTED_SUBJECT_LINE_S13"
    echo "File content:"
    cat "$TAYLORED_DIR_NAME/$OFFSET_MSG_PLUGIN_NAME_S13"
    exit 1
  fi
  echo -e "${GREEN}Subject line '$EXPECTED_SUBJECT_LINE_S13' found in patch file.${NC}"
else
  echo -e "${RED}Error: 'taylored --offset' with --message failed unexpectedly. Exit code: $OFFSET_MSG_EXIT_CODE_S13 ${NC}"
  echo "Output was: $OFFSET_MSG_OUTPUT_S13"
  exit 1
fi

# 13c. Test --data
echo -e "${YELLOW}Running 'taylored --data $OFFSET_MSG_PLUGIN_NAME_S13' to verify custom message...${NC}"
EXTRACTED_MESSAGE_S13=$($TAYLORED_CMD_BASE --data "$OFFSET_MSG_PLUGIN_NAME_S13")
if [ "$EXTRACTED_MESSAGE_S13" = "$CUSTOM_MESSAGE_S13" ]; then
  echo -e "${GREEN}'taylored --data' extracted the custom message '$CUSTOM_MESSAGE_S13' correctly.${NC}"
else
  echo -e "${RED}Error: 'taylored --data' extracted an incorrect message.${NC}"
  echo -e "  Expected: \"$CUSTOM_MESSAGE_S13\""
  echo -e "  Got:      \"$EXTRACTED_MESSAGE_S13\""
  exit 1
fi

# 13d. Test --offset with message when hunks are inverted (message should still be updated)
echo -e "${YELLOW}Testing --offset with --message when hunks are inverted...${NC}"
# Create a scenario for inverted hunks.
# Current state: main is at $MAIN_COMMIT_S13_MSG_TEST.
# $OFFSET_MSG_PLUGIN_NAME_S13 has the custom message and reflects changes from $OFFSET_MSG_BRANCH_S13 to $MAIN_COMMIT_S13_MSG_TEST.
# To make it "inverted", we want the state on the temp branch (after applying the patch) to be $OFFSET_MSG_BRANCH_S13.
# And then `git diff main HEAD` (where main is $MAIN_COMMIT_S13_MSG_TEST and HEAD is $OFFSET_MSG_BRANCH_S13)
# should be the inverse of the original patch (which was $OFFSET_MSG_BRANCH_S13 vs $MAIN_COMMIT_S13_MSG_TEST).
# This is tricky to force perfectly for the "inverted hunks" logic without knowing the exact diff.
# For simplicity, let's assume a case where the diff content itself might not change much, but we want to update the message.
# We'll re-run offset on the same patch, but with a new message.
# The "inverted hunks" logic might trigger if the re-calculated diff is identical to the previous one.

NEW_CUSTOM_MESSAGE_S13_INVERTED="Updated Message For Inverted S13"
EXPECTED_SUBJECT_LINE_S13_INVERTED="Subject: [PATCH] $NEW_CUSTOM_MESSAGE_S13_INVERTED"

echo -e "${YELLOW}Running 'taylored --offset $OFFSET_MSG_PLUGIN_NAME_S13 --message \"$NEW_CUSTOM_MESSAGE_S13_INVERTED\"' (expecting message update even if hunks might be considered inverted/same)...${NC}"
set +e
OFFSET_MSG_OUTPUT_S13_INV=$($TAYLORED_CMD_BASE --offset "$OFFSET_MSG_PLUGIN_NAME_S13" --message "$NEW_CUSTOM_MESSAGE_S13_INVERTED" 2>&1)
OFFSET_MSG_EXIT_CODE_S13_INV=$?
set -e

if [ $OFFSET_MSG_EXIT_CODE_S13_INV -eq 0 ]; then
  echo -e "${GREEN}'taylored --offset' with new message (inverted/same hunk scenario) succeeded.${NC}"
  if ! grep -q "$EXPECTED_SUBJECT_LINE_S13_INVERTED" "$TAYLORED_DIR_NAME/$OFFSET_MSG_PLUGIN_NAME_S13"; then
    echo -e "${RED}Error: Expected new Subject line not found in $OFFSET_MSG_PLUGIN_NAME_S13 after second offset run.${NC}"
    echo "Expected to find: $EXPECTED_SUBJECT_LINE_S13_INVERTED"
    echo "File content:"
    cat "$TAYLORED_DIR_NAME/$OFFSET_MSG_PLUGIN_NAME_S13"
    exit 1
  fi
  echo -e "${GREEN}New Subject line '$EXPECTED_SUBJECT_LINE_S13_INVERTED' found in patch file.${NC}"
  
  EXTRACTED_MESSAGE_S13_INV=$($TAYLORED_CMD_BASE --data "$OFFSET_MSG_PLUGIN_NAME_S13")
  if [ "$EXTRACTED_MESSAGE_S13_INV" = "$NEW_CUSTOM_MESSAGE_S13_INVERTED" ]; then
    echo -e "${GREEN}'taylored --data' extracted the new custom message '$NEW_CUSTOM_MESSAGE_S13_INVERTED' correctly.${NC}"
  else
    echo -e "${RED}Error: 'taylored --data' extracted an incorrect message after second offset run.${NC}"
    echo -e "  Expected: \"$NEW_CUSTOM_MESSAGE_S13_INVERTED\""
    echo -e "  Got:      \"$EXTRACTED_MESSAGE_S13_INV\""
    exit 1
  fi
else
  echo -e "${RED}Error: 'taylored --offset' with new message (inverted/same hunk scenario) failed unexpectedly. Exit code: $OFFSET_MSG_EXIT_CODE_S13_INV ${NC}"
  echo "Output was: $OFFSET_MSG_OUTPUT_S13_INV"
  exit 1
fi


git branch -D "$OFFSET_MSG_BRANCH_S13" &>/dev/null || true
rm -f "$TAYLORED_DIR_NAME/$OFFSET_MSG_PLUGIN_NAME_S13"
git checkout main
git reset --hard "$MAIN_COMMIT_S13_MSG_TEST" # Reset to before this test step's specific commits
git commit --amend -m "File base per S13 --offset --message (Reset)" --no-edit --allow-empty
echo "----------------------------------------"

# Step 14 (was 15): Test 'taylored --offset' for uncommitted changes and successful update
echo -e "${YELLOW}Step 14: Testing 'taylored --offset' for uncommitted changes and successful update...${NC}"
git checkout main
git reset --hard "$FIRST_MAIN_COMMIT_HASH" 

OFFSET_S14_FILE="offset_s14_test_file.txt"
OFFSET_S14_BRANCH="offset-s14-branch"
OFFSET_S14_PLUGIN_NAME="${OFFSET_S14_BRANCH}.taylored"
OFFSET_S14_MESSAGE="Offset S14 Test Message"

# 14a. Setup patch
echo "Base content for $OFFSET_S14_FILE." > "$OFFSET_S14_FILE"
git add "$OFFSET_S14_FILE"
git commit -m "Setup S14: Add $OFFSET_S14_FILE to main"
MAIN_COMMIT_FOR_S14_PATCH=$(git rev-parse HEAD)

git checkout -b "$OFFSET_S14_BRANCH" "$MAIN_COMMIT_FOR_S14_PATCH"
echo "Added line on $OFFSET_S14_BRANCH." >> "$OFFSET_S14_FILE"
git add "$OFFSET_S14_FILE"
git commit -m "Modifications on $OFFSET_S14_BRANCH for S14"

git checkout main
git reset --hard "$MAIN_COMMIT_FOR_S14_PATCH" 
$TAYLORED_CMD_BASE --save "$OFFSET_S14_BRANCH"
INITIAL_PATCH_CONTENT_S14=$(cat "$TAYLORED_DIR_NAME/$OFFSET_S14_PLUGIN_NAME")

# 14b. Test --offset with uncommitted changes
echo -e "${YELLOW}Testing 'taylored --offset' with uncommitted changes...${NC}"
echo "Uncommitted changes in $OFFSET_S14_FILE" >> "$OFFSET_S14_FILE"
set +e
OFFSET_S14_UNCOMMITTED_OUTPUT=$($TAYLORED_CMD_BASE --offset "$OFFSET_S14_PLUGIN_NAME" 2>&1)
OFFSET_S14_UNCOMMITTED_EXIT_CODE=$?
set -e

if [ $OFFSET_S14_UNCOMMITTED_EXIT_CODE -ne 0 ]; then
  echo -e "${GREEN}'taylored --offset' failed as expected due to uncommitted changes.${NC}"
  if ! echo "$OFFSET_S14_UNCOMMITTED_OUTPUT" | grep -q "Uncommitted changes detected"; then
    echo -e "${RED}Error: Expected 'Uncommitted changes detected' message not found.${NC}"
    echo "Output was: $OFFSET_S14_UNCOMMITTED_OUTPUT"
    exit 1
  fi
else
  echo -e "${RED}Error: 'taylored --offset' succeeded unexpectedly with uncommitted changes.${NC}"
  exit 1
fi
# Clean up uncommitted changes
git checkout -- "$OFFSET_S14_FILE"
echo -e "${GREEN}Uncommitted changes cleaned up.${NC}"


# 14c. Test successful --offset run (no message)
echo -e "${YELLOW}Running 'taylored --offset $OFFSET_S14_PLUGIN_NAME' (clean workspace, no message)...${NC}"
set +e
OFFSET_S14_RUN1_OUTPUT=$($TAYLORED_CMD_BASE --offset "$OFFSET_S14_PLUGIN_NAME" 2>&1)
OFFSET_S14_RUN1_EXIT_CODE=$?
set -e

if [ $OFFSET_S14_RUN1_EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}'taylored --offset' (clean, no message) succeeded.${NC}"
  EXTRACTED_MSG_S14_RUN1=$($TAYLORED_CMD_BASE --data "$OFFSET_S14_PLUGIN_NAME")
  if [ -z "$EXTRACTED_MSG_S14_RUN1" ]; then
    echo -e "${GREEN}--data extracts empty message as expected (original patch from --save had no Subject).${NC}"
  else
    echo -e "${RED}Error: --data extracted '$EXTRACTED_MSG_S14_RUN1', expected empty.${NC}"
    exit 1
  fi
else
  echo -e "${RED}Error: 'taylored --offset' (clean, no message) failed. Exit: $OFFSET_S14_RUN1_EXIT_CODE ${NC}"
  echo "Output: $OFFSET_S14_RUN1_OUTPUT"
  exit 1
fi

# 14d. Test successful --offset run (with message)
EXPECTED_SUBJECT_S14_MSG="Subject: [PATCH] $OFFSET_S14_MESSAGE"
echo -e "${YELLOW}Running 'taylored --offset $OFFSET_S14_PLUGIN_NAME --message \"$OFFSET_S14_MESSAGE\"' (clean workspace, with message)...${NC}"
set +e
OFFSET_S14_RUN2_OUTPUT=$($TAYLORED_CMD_BASE --offset "$OFFSET_S14_PLUGIN_NAME" --message "$OFFSET_S14_MESSAGE" 2>&1)
OFFSET_S14_RUN2_EXIT_CODE=$?
set -e
if [ $OFFSET_S14_RUN2_EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}'taylored --offset' (clean, with message) succeeded.${NC}"
  if ! grep -q "$EXPECTED_SUBJECT_S14_MSG" "$TAYLORED_DIR_NAME/$OFFSET_S14_PLUGIN_NAME"; then
    echo -e "${RED}Error: Expected Subject line not found in $OFFSET_S14_PLUGIN_NAME after --message.${NC}"
    cat "$TAYLORED_DIR_NAME/$OFFSET_S14_PLUGIN_NAME"
    exit 1
  fi
  echo -e "${GREEN}Subject line for '$OFFSET_S14_MESSAGE' found.${NC}"
  EXTRACTED_MSG_S14_RUN2=$($TAYLORED_CMD_BASE --data "$OFFSET_S14_PLUGIN_NAME")
  if [ "$EXTRACTED_MSG_S14_RUN2" = "$OFFSET_S14_MESSAGE" ]; then
    echo -e "${GREEN}--data extracts '$OFFSET_S14_MESSAGE' correctly.${NC}"
  else
    echo -e "${RED}Error: --data extracted '$EXTRACTED_MSG_S14_RUN2', expected '$OFFSET_S14_MESSAGE'.${NC}"
    exit 1
  fi
else
  echo -e "${RED}Error: 'taylored --offset' (clean, with message) failed. Exit: $OFFSET_S14_RUN2_EXIT_CODE ${NC}"
  echo "Output: $OFFSET_S14_RUN2_OUTPUT"
  exit 1
fi

# 14e. Cleanup for Step 14
git branch -D "$OFFSET_S14_BRANCH" &>/dev/null || true
rm -f "$TAYLORED_DIR_NAME/$OFFSET_S14_PLUGIN_NAME"
git checkout main
git reset --hard "$MAIN_COMMIT_FOR_S14_PATCH" 
if [ -f "$OFFSET_S14_FILE" ]; then
  git rm "$OFFSET_S14_FILE" >/dev/null
fi
git commit --amend -m "Setup S14: Add $OFFSET_S14_FILE to main (Reset and cleaned)" --no-edit --allow-empty
echo "----------------------------------------"


echo -e "${GREEN}All Taylored tests passed successfully!${NC}"

exit 0

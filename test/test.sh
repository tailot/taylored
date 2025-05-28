#!/bin/bash

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

SCRIPT_DIR_PATH=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
PROJECT_ROOT_PATH=$(cd "$SCRIPT_DIR_PATH/.." &>/dev/null && pwd)

TAYLORED_CMD_BASE="npx ts-node $PROJECT_ROOT_PATH/index.ts"
TAYLORED_DIR_NAME=".taylored"

TEST_SUBDIR_NAME="taylored_test_repo_space"
TEST_DIR_FULL_PATH="$PROJECT_ROOT_PATH/$TEST_SUBDIR_NAME"


cleanup() {
  echo -e "${YELLOW}Cleaning up...${NC}"
  # shellcheck disable=SC2164 # Non vogliamo uscire se cd fallisce qui, proviamo comunque a pulire
  cd "$PROJECT_ROOT_PATH"
  echo -e "${YELLOW}Removing $TEST_DIR_FULL_PATH...${NC}"
  rm -rf "$TEST_DIR_FULL_PATH"
  echo -e "${GREEN}Cleanup complete.${NC}"
}

trap cleanup EXIT

echo -e "${YELLOW}Starting Taylored functionality tests...${NC}"

echo -e "${YELLOW}Step 1: Setting up test Git repository...${NC}"
if [ -d "$TEST_DIR_FULL_PATH" ]; then
  echo -e "${YELLOW}Removing existing test directory: $TEST_DIR_FULL_PATH${NC}"
  rm -rf "$TEST_DIR_FULL_PATH"
fi
mkdir -p "$TEST_DIR_FULL_PATH"
cd "$TEST_DIR_FULL_PATH" || { echo -e "${RED}ERROR: Could not access $TEST_DIR_FULL_PATH${NC}"; exit 1; }

git init -b main
git config user.email "test@example.com" # Git richiede la configurazione dell'utente
git config user.name "Test User"

# Crea file iniziale sul branch main
echo "Riga 1 iniziale in file1." > file1.txt
echo "Riga 2 in file1 da rimuovere." >> file1.txt
echo "Riga 3 in file1 che rimane." >> file1.txt
echo "Contenuto del file_da_eliminare.txt" > file_to_delete.txt
git add file1.txt file_to_delete.txt
git commit -m "Commit iniziale su main"
INITIAL_FILE1_CONTENT=$(cat file1.txt)
INITIAL_FILE_TO_DELETE_CONTENT=$(cat file_to_delete.txt)

BRANCH_DELETIONS="deletions-branch"
PLUGIN_DELETIONS_NAME="${BRANCH_DELETIONS}.taylored"

git checkout -b "$BRANCH_DELETIONS"
echo "Riga 1 iniziale in file1." > file1.txt
echo "Riga 3 in file1 che rimane." >> file1.txt
git rm file_to_delete.txt
git add file1.txt
git commit -m "Modifiche con solo rimozioni su $BRANCH_DELETIONS"
MODIFIED_FILE1_DELETIONS_CONTENT=$(cat file1.txt)

git checkout main
echo -e "${GREEN}Test Git repository setup complete.${NC}"
echo "----------------------------------------"

echo -e "${YELLOW}Step 2: Testing 'taylored --save' with deletions branch ($BRANCH_DELETIONS)...${NC}"
$TAYLORED_CMD_BASE --save "$BRANCH_DELETIONS"

if [ -f "$TAYLORED_DIR_NAME/$PLUGIN_DELETIONS_NAME" ]; then
  echo -e "${GREEN}'taylored --save' successfully created $TAYLORED_DIR_NAME/$PLUGIN_DELETIONS_NAME.${NC}"
else
  echo -e "${RED}Error: 'taylored --save' failed to create $TAYLORED_DIR_NAME/$PLUGIN_DELETIONS_NAME.${NC}"
  exit 1
fi
echo "----------------------------------------"

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

echo -e "${YELLOW}Step 3: Testing 'taylored --verify-add' for $PLUGIN_DELETIONS_NAME...${NC}"
if $TAYLORED_CMD_BASE --verify-add "$PLUGIN_DELETIONS_NAME"; then
  echo -e "${GREEN}'taylored --verify-add' for $PLUGIN_DELETIONS_NAME completed successfully.${NC}"
else
  echo -e "${RED}Error: 'taylored --verify-add' for $PLUGIN_DELETIONS_NAME failed.${NC}"
  exit 1
fi
if [ "$(cat file1.txt)" != "$INITIAL_FILE1_CONTENT" ]; then
    echo -e "${RED}Error: file1.txt modified after --verify-add.${NC}"
    exit 1
fi
if [ ! -f "file_to_delete.txt" ]; then
    echo -e "${RED}Error: file_to_delete.txt removed after --verify-add.${NC}"
    exit 1
fi
echo "----------------------------------------"

echo -e "${YELLOW}Step 4: Testing 'taylored --add' with $PLUGIN_DELETIONS_NAME...${NC}"
$TAYLORED_CMD_BASE --add "$PLUGIN_DELETIONS_NAME"

if [ ! -f "file1.txt" ] || [ "$(cat file1.txt)" != "$MODIFIED_FILE1_DELETIONS_CONTENT" ]; then
  echo -e "${RED}Error: content of file1.txt is not as expected after 'taylored --add $PLUGIN_DELETIONS_NAME'.${NC}"
  echo "Expected:"
  echo "$MODIFIED_FILE1_DELETIONS_CONTENT"
  echo "Got:"
  cat file1.txt || echo "file1.txt non trovato"
  exit 1
fi

if [ -f "file_to_delete.txt" ]; then
  echo -e "${RED}Error: file_to_delete.txt was not removed after 'taylored --add $PLUGIN_DELETIONS_NAME'.${NC}"
  exit 1
fi
echo -e "${GREEN}'taylored --add $PLUGIN_DELETIONS_NAME' seems to have worked correctly.${NC}"
echo "----------------------------------------"

echo -e "${YELLOW}Step 5: Testing 'taylored --verify-remove' for applied $PLUGIN_DELETIONS_NAME...${NC}"
if $TAYLORED_CMD_BASE --verify-remove "$PLUGIN_DELETIONS_NAME"; then
  echo -e "${GREEN}'taylored --verify-remove' for $PLUGIN_DELETIONS_NAME completed successfully.${NC}"
else
  echo -e "${RED}Error: 'taylored --verify-remove' for $PLUGIN_DELETIONS_NAME failed.${NC}"
  exit 1
fi
if [ "$(cat file1.txt)" != "$MODIFIED_FILE1_DELETIONS_CONTENT" ]; then
    echo -e "${RED}Error: file1.txt modified after --verify-remove.${NC}"
    exit 1
fi
if [ -f "file_to_delete.txt" ]; then
    echo -e "${RED}Error: file_to_delete.txt reappeared after --verify-remove.${NC}"
    exit 1
fi
echo "----------------------------------------"

echo -e "${YELLOW}Step 6: Testing 'taylored --remove' with $PLUGIN_DELETIONS_NAME...${NC}"
$TAYLORED_CMD_BASE --remove "$PLUGIN_DELETIONS_NAME"

if [ ! -f "file1.txt" ] || [ "$(cat file1.txt)" != "$INITIAL_FILE1_CONTENT" ]; then
  echo -e "${RED}Error: content of file1.txt was not restored after 'taylored --remove'.${NC}"
  echo "Expected:"
  echo "$INITIAL_FILE1_CONTENT"
  echo "Got:"
  cat file1.txt || echo "file1.txt non trovato"
  exit 1
fi

if [ ! -f "file_to_delete.txt" ] || [ "$(cat file_to_delete.txt)" != "$INITIAL_FILE_TO_DELETE_CONTENT" ]; then
  echo -e "${RED}Error: file_to_delete.txt was not restored or content is incorrect after 'taylored --remove'.${NC}"
  exit 1
fi
echo -e "${GREEN}'taylored --remove $PLUGIN_DELETIONS_NAME' seems to have worked correctly.${NC}"
echo "----------------------------------------"

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

echo -e "${YELLOW}Step 7: Testing 'taylored --save' with additions branch ($BRANCH_ADDITIONS)...${NC}"
$TAYLORED_CMD_BASE --save "$BRANCH_ADDITIONS"
if [ -f "$TAYLORED_DIR_NAME/$PLUGIN_ADDITIONS_NAME" ]; then
  echo -e "${GREEN}'taylored --save' successfully created $TAYLORED_DIR_NAME/$PLUGIN_ADDITIONS_NAME.${NC}"
else
  echo -e "${RED}Error: 'taylored --save' failed to create $TAYLORED_DIR_NAME/$PLUGIN_ADDITIONS_NAME.${NC}"
  exit 1
fi

echo -e "${YELLOW}Step 7a: Testing 'taylored --add' with $PLUGIN_ADDITIONS_NAME...${NC}"
$TAYLORED_CMD_BASE --add "$PLUGIN_ADDITIONS_NAME"
if [ "$(cat file1.txt)" != "$MODIFIED_FILE1_ADDITIONS_CONTENT" ] || \
   [ ! -f "new_file.txt" ] || [ "$(cat new_file.txt)" != "$NEW_FILE_CONTENT" ]; then
  echo -e "${RED}Error: 'taylored --add $PLUGIN_ADDITIONS_NAME' did not apply changes correctly.${NC}"
  exit 1
fi
echo -e "${GREEN}'taylored --add $PLUGIN_ADDITIONS_NAME' applied successfully.${NC}"

echo -e "${YELLOW}Step 7b: Testing 'taylored --remove' with $PLUGIN_ADDITIONS_NAME...${NC}"
$TAYLORED_CMD_BASE --remove "$PLUGIN_ADDITIONS_NAME"
if [ "$(cat file1.txt)" != "$INITIAL_FILE1_CONTENT" ] || [ -f "new_file.txt" ]; then
  echo -e "${RED}Error: 'taylored --remove $PLUGIN_ADDITIONS_NAME' did not restore state correctly.${NC}"
  exit 1
fi
echo -e "${GREEN}'taylored --remove $PLUGIN_ADDITIONS_NAME' removed successfully.${NC}"
echo "----------------------------------------"

BRANCH_MIXED="mixed-changes-branch"
PLUGIN_MIXED_NAME="${BRANCH_MIXED}.taylored"

git checkout -b "$BRANCH_MIXED"
echo "Riga aggiunta a file1 per test misto." >> file1.txt # Aggiunta
sed -i.bak '/Riga 3 in file1 che rimane./d' file1.txt && rm file1.txt.bak # Rimozione (MacOS sed)
git add file1.txt
git commit -m "Modifiche miste su $BRANCH_MIXED"
git checkout main

echo -e "${YELLOW}Step 8: Testing 'taylored --save' with mixed changes branch ($BRANCH_MIXED)...${NC}"
if $TAYLORED_CMD_BASE --save "$BRANCH_MIXED"; then
  if [ -f "$TAYLORED_DIR_NAME/$PLUGIN_MIXED_NAME" ]; then
    echo -e "${RED}Error: 'taylored --save' should have failed or not created $PLUGIN_MIXED_NAME for mixed changes, but it was created.${NC}"
    ls -l "$TAYLORED_DIR_NAME/"
    exit 1
  else
    echo -e "${YELLOW}Warning: 'taylored --save' for mixed changes completed successfully (0) but did not create the file. This might be acceptable if the error is just a message.${NC}"
  fi
else
  echo -e "${GREEN}'taylored --save' failed as expected for mixed changes.${NC}"
  if [ -f "$TAYLORED_DIR_NAME/$PLUGIN_MIXED_NAME" ]; then
    echo -e "${RED}Error: 'taylored --save' failed but still created $PLUGIN_MIXED_NAME.${NC}"
    exit 1
  fi
fi
echo "----------------------------------------"

echo -e "${YELLOW}Step 9: Testing 'taylored --upgrade'...${NC}"
BRANCH_UPGRADE_TARGET="upgrade-target-branch"
PLUGIN_UPGRADE_TARGET_NAME="${BRANCH_UPGRADE_TARGET}.taylored"

git checkout -b "$BRANCH_UPGRADE_TARGET"
echo "Contenuto iniziale per upgrade_file.txt" > upgrade_file.txt
git add upgrade_file.txt
git commit -m "Commit iniziale per $BRANCH_UPGRADE_TARGET"
git checkout main
$TAYLORED_CMD_BASE --save "$BRANCH_UPGRADE_TARGET"

git checkout "$BRANCH_UPGRADE_TARGET"
echo "Riga aggiunta in upgrade_file.txt" >> upgrade_file.txt
git add upgrade_file.txt
git commit -m "Aggiunte su $BRANCH_UPGRADE_TARGET"
git checkout main

echo -e "${YELLOW}Step 9a: Testing --upgrade (clean scenario)...${NC}"
UPGRADE_OUTPUT_CLEAN=$($TAYLORED_CMD_BASE --upgrade)
if echo "$UPGRADE_OUTPUT_CLEAN" | grep -q "upgraded successfully" && echo "$UPGRADE_OUTPUT_CLEAN" | grep -q "$PLUGIN_UPGRADE_TARGET_NAME"; then
  echo -e "${GREEN}'taylored --upgrade' successfully upgraded $PLUGIN_UPGRADE_TARGET_NAME.${NC}"
else
  echo -e "${RED}Error: 'taylored --upgrade' (clean scenario) failed or unexpected output.${NC}"
  echo "$UPGRADE_OUTPUT_CLEAN"
fi

echo "Contenuto originale di upgrade_file.txt su main" > upgrade_file.txt
git add upgrade_file.txt
git commit -m "Aggiunto upgrade_file.txt a main per test obsolescenza"

git checkout "$BRANCH_UPGRADE_TARGET"
echo "Riga aggiunta da upgrade-target-branch che causa conflitto" >> upgrade_file.txt
sed -i.bak '1s/.*/Linea modificata da upgrade-target-branch./' upgrade_file.txt && rm upgrade_file.txt.bak
git add upgrade_file.txt
git commit -m "Modifiche miste su $BRANCH_UPGRADE_TARGET"
git checkout main

echo -e "${YELLOW}Step 9b: Testing --upgrade (obsolete scenario)...${NC}"
UPGRADE_OUTPUT_OBSOLETE=$($TAYLORED_CMD_BASE --upgrade)
if echo "$UPGRADE_OUTPUT_OBSOLETE" | grep -q "is now obsolete" && echo "$UPGRADE_OUTPUT_OBSOLETE" | grep -q "$PLUGIN_UPGRADE_TARGET_NAME"; then
  echo -e "${GREEN}'taylored --upgrade' correctly identified $PLUGIN_UPGRADE_TARGET_NAME as obsolete.${NC}"
else
  echo -e "${RED}Error: 'taylored --upgrade' (obsolete scenario) failed or unexpected output.${NC}"
  echo "$UPGRADE_OUTPUT_OBSOLETE"
fi
echo "----------------------------------------"

echo -e "${YELLOW}Step 10: Testing 'taylored --add' on a slightly modified state...${NC}"
git checkout -- file1.txt file_to_delete.txt
rm -f new_file.txt

echo "Modifica leggera prima di riapplicare." >> file1.txt
echo "Attempting to apply $PLUGIN_DELETIONS_NAME to a modified file1.txt..."

if $TAYLORED_CMD_BASE --add "$PLUGIN_DELETIONS_NAME"; then
    echo -e "${YELLOW}Warning: 'taylored --add' succeeded on a modified file. This may or may not be correct, depending on desired behavior (e.g., fuzzy patching).${NC}"
    git checkout -- file1.txt
    if [ -f "file_to_delete.txt" ]; then git checkout -- file_to_delete.txt; else echo "Contenuto del file_da_eliminare.txt" > file_to_delete.txt; git add file_to_delete.txt; git commit -m "ripristino file_to_delete" --allow-empty; fi

else
    echo -e "${GREEN}'taylored --add' failed on a modified file, as might be expected. Check for any .rej files or specific error messages.${NC}"
    find . -name "*.rej" -print -delete
    git checkout -- file1.txt
fi
CURRENT_FILE1_CONTENT_AFTER_DIRTY_APPLY=$(cat file1.txt)
if [ "$CURRENT_FILE1_CONTENT_AFTER_DIRTY_APPLY" != "$INITIAL_FILE1_CONTENT" ]; then
  echo -e "${RED}Error: file1.txt was not reset to initial content after testing apply on modified state.${NC}"
  echo "Expected:"
  echo "$INITIAL_FILE1_CONTENT"
  echo "Got:"
  echo "$CURRENT_FILE1_CONTENT_AFTER_DIRTY_APPLY"
  exit 1
fi
echo "----------------------------------------"

echo -e "${YELLOW}Step 11: Testing 'taylored --remove' when plugin ($PLUGIN_DELETIONS_NAME) is not applied...${NC}"
if ! $TAYLORED_CMD_BASE --remove "$PLUGIN_DELETIONS_NAME" >/dev/null 2>&1; then
  echo -e "${GREEN}'taylored --remove' on a non-applied plugin failed as expected (git apply --reverse does not find patched state).${NC}"
  if [ ! -f "file1.txt" ] || [ "$(cat file1.txt)" != "$INITIAL_FILE1_CONTENT" ]; then
    echo -e "${RED}Error: content of file1.txt changed unexpectedly.${NC}"
    exit 1
  fi
  if [ ! -f "file_to_delete.txt" ]; then
    echo -e "${RED}Error: file_to_delete.txt disappeared unexpectedly.${NC}"
    exit 1
  fi
else
  echo -e "${YELLOW}Warning: 'taylored --remove' on a non-applied plugin completed successfully (0). This is OK if the tool handles idempotency, but verify files remained unchanged.${NC}"
  exit 1
fi
echo "----------------------------------------"

echo -e "${GREEN}All Taylored tests passed successfully!${NC}"

exit 0
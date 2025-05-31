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
UPGRADE_OUTPUT_OBSOLETE=$($TAYLORED_CMD_BASE --upgrade 2>&1)

output_contains_obsolete_keyword=false
output_mentions_target_plugin=false

if echo "$UPGRADE_OUTPUT_OBSOLETE" | grep -q "is now obsolete"; then
    output_contains_obsolete_keyword=true
fi
if echo "$UPGRADE_OUTPUT_OBSOLETE" | grep -q "$PLUGIN_UPGRADE_TARGET_NAME"; then
    output_mentions_target_plugin=true
fi

if $output_contains_obsolete_keyword && $output_mentions_target_plugin; then
  echo -e "${GREEN}'taylored --upgrade' correctly identified $PLUGIN_UPGRADE_TARGET_NAME as obsolete.${NC}"
else
  echo -e "${RED}Error: 'taylored --upgrade' (obsolete scenario) failed or unexpected output.${NC}"
  echo "DEBUG: output_contains_obsolete_keyword = $output_contains_obsolete_keyword"
  echo "DEBUG: output_mentions_target_plugin = $output_mentions_target_plugin"
  echo "Full output was:"
  echo "$UPGRADE_OUTPUT_OBSOLETE"
  exit 1
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

echo -e "${YELLOW}Step 12: Testing 'taylored --offset' for a DELETIONS patch...${NC}"
git checkout main
git reset --hard HEAD # Assicura uno stato pulito di main

# 12a. Setup per il test di offset su rimozioni
OFFSET_DEL_FILE="offset_deletions_test_file.txt"
OFFSET_DEL_BRANCH="deletions-offset-branch"
OFFSET_DEL_PLUGIN_NAME="${OFFSET_DEL_BRANCH}.taylored"

cat << EOF > "$OFFSET_DEL_FILE"
Line 1 for deletion offset test
Line 2 to be deleted
Line 3 to be deleted
Line 4 for deletion offset test
Line 5 for deletion offset test
EOF
git add "$OFFSET_DEL_FILE"
git commit -m "Initial content for deletions offset test"
MAIN_STATE_OFFSET_DEL_CONTENT=$(cat "$OFFSET_DEL_FILE")

git checkout -b "$OFFSET_DEL_BRANCH"
cat << EOF > "$OFFSET_DEL_FILE"
Line 1 for deletion offset test
Line 4 for deletion offset test
Line 5 for deletion offset test
EOF
git add "$OFFSET_DEL_FILE"
git commit -m "Deletions on $OFFSET_DEL_BRANCH"
BRANCH_STATE_OFFSET_DEL_CONTENT=$(cat "$OFFSET_DEL_FILE")

git checkout main
$TAYLORED_CMD_BASE --save "$OFFSET_DEL_BRANCH"
if [ ! -f "$TAYLORED_DIR_NAME/$OFFSET_DEL_PLUGIN_NAME" ]; then
  echo -e "${RED}Error: Failed to create $OFFSET_DEL_PLUGIN_NAME for offset test.${NC}"
  exit 1
fi
echo -e "${GREEN}Deletion patch $OFFSET_DEL_PLUGIN_NAME created for offset test.${NC}"

# 12b. Modifica main per rompere gli offset originali
cat << EOF > "$OFFSET_DEL_FILE"
ADDED PREPEND LINE 1
ADDED PREPEND LINE 2
Line 1 for deletion offset test
Line 2 to be deleted
Line 3 to be deleted
Line 4 for deletion offset test
Line 5 for deletion offset test
EOF
git add "$OFFSET_DEL_FILE"
git commit -m "Shift context on main for deletions offset test"
MAIN_MODIFIED_FOR_OFFSET_DEL_CONTENT=$(cat "$OFFSET_DEL_FILE")

echo -e "${YELLOW}Attempting to apply $OFFSET_DEL_PLUGIN_NAME (before offset update) - expecting failure or incorrect application...${NC}"
if $TAYLORED_CMD_BASE --verify-add "$OFFSET_DEL_PLUGIN_NAME" > /dev/null 2>&1 ; then
    echo -e "${YELLOW}Warning: --verify-add for $OFFSET_DEL_PLUGIN_NAME passed unexpectedly before offset update. Patch might still apply fuzzily.${NC}"
else
    echo -e "${GREEN}--verify-add for $OFFSET_DEL_PLUGIN_NAME failed as expected before offset update.${NC}"
fi

# 12c. Esegui taylored --offset
echo -e "${YELLOW}Running 'taylored --offset' for $OFFSET_DEL_PLUGIN_NAME...${NC}"
if $TAYLORED_CMD_BASE --offset "$OFFSET_DEL_PLUGIN_NAME"; then
  echo -e "${GREEN}'taylored --offset' for $OFFSET_DEL_PLUGIN_NAME completed successfully.${NC}"
else
  echo -e "${RED}Error: 'taylored --offset' for $OFFSET_DEL_PLUGIN_NAME failed.${NC}"
  exit 1
fi

# 12d. Verifica l'applicazione della patch aggiornata
echo -e "${YELLOW}Verifying and applying $OFFSET_DEL_PLUGIN_NAME after offset update...${NC}"
if ! $TAYLORED_CMD_BASE --verify-add "$OFFSET_DEL_PLUGIN_NAME"; then
  echo -e "${RED}Error: --verify-add for $OFFSET_DEL_PLUGIN_NAME failed after offset update.${NC}"
  exit 1
fi
$TAYLORED_CMD_BASE --add "$OFFSET_DEL_PLUGIN_NAME"

EXPECTED_CONTENT_AFTER_OFFSET_DEL_APPLY=$(cat << EOF
ADDED PREPEND LINE 1
ADDED PREPEND LINE 2
Line 1 for deletion offset test
Line 4 for deletion offset test
Line 5 for deletion offset test
EOF
)

if [ "$(cat "$OFFSET_DEL_FILE")" != "$EXPECTED_CONTENT_AFTER_OFFSET_DEL_APPLY" ]; then
  echo -e "${RED}Error: Content of $OFFSET_DEL_FILE is not as expected after applying offset-updated deletions patch.${NC}"
  echo "Expected:"
  echo "$EXPECTED_CONTENT_AFTER_OFFSET_DEL_APPLY"
  echo "Got:"
  cat "$OFFSET_DEL_FILE"
  exit 1
fi
echo -e "${GREEN}Offset-updated deletions patch $OFFSET_DEL_PLUGIN_NAME applied correctly.${NC}"
$TAYLORED_CMD_BASE --remove "$OFFSET_DEL_PLUGIN_NAME" &>/dev/null || true # Cleanup, ignore errors
git branch -D "$OFFSET_DEL_BRANCH" &>/dev/null || true
rm -f "$TAYLORED_DIR_NAME/$OFFSET_DEL_PLUGIN_NAME"
echo "----------------------------------------"

echo -e "${YELLOW}Step 13: Testing 'taylored --offset' for an ADDITIONS patch...${NC}"
git checkout main
git reset --hard HEAD # Assicura uno stato pulito di main

# 13a. Setup per il test di offset su aggiunte
OFFSET_ADD_FILE="offset_additions_test_file.txt"
OFFSET_ADD_BRANCH="additions-offset-branch"
OFFSET_ADD_PLUGIN_NAME="${OFFSET_ADD_BRANCH}.taylored"

cat << EOF > "$OFFSET_ADD_FILE"
Base line 1 for additions offset test
Base line 2 for additions offset test
EOF
git add "$OFFSET_ADD_FILE"
git commit -m "Initial content for additions offset test"

git checkout -b "$OFFSET_ADD_BRANCH"
cat << EOF > "$OFFSET_ADD_FILE"
Base line 1 for additions offset test
NEWLY ADDED LINE A
NEWLY ADDED LINE B
Base line 2 for additions offset test
EOF
git add "$OFFSET_ADD_FILE"
git commit -m "Additions on $OFFSET_ADD_BRANCH"

git checkout main
$TAYLORED_CMD_BASE --save "$OFFSET_ADD_BRANCH"
if [ ! -f "$TAYLORED_DIR_NAME/$OFFSET_ADD_PLUGIN_NAME" ]; then
  echo -e "${RED}Error: Failed to create $OFFSET_ADD_PLUGIN_NAME for offset test.${NC}"
  exit 1
fi
echo -e "${GREEN}Addition patch $OFFSET_ADD_PLUGIN_NAME created for offset test.${NC}"

# 13b. Modifica main per rompere gli offset originali
cat << EOF > "$OFFSET_ADD_FILE"
EXTRA PREPEND LINE X
EXTRA PREPEND LINE Y
Base line 1 for additions offset test
Base line 2 for additions offset test
EOF
git add "$OFFSET_ADD_FILE"
git commit -m "Shift context on main for additions offset test"

# 13c. Esegui taylored --offset
echo -e "${YELLOW}Running 'taylored --offset' for $OFFSET_ADD_PLUGIN_NAME...${NC}"
if $TAYLORED_CMD_BASE --offset "$OFFSET_ADD_PLUGIN_NAME"; then
  echo -e "${GREEN}'taylored --offset' for $OFFSET_ADD_PLUGIN_NAME completed successfully.${NC}"
else
  echo -e "${RED}Error: 'taylored --offset' for $OFFSET_ADD_PLUGIN_NAME failed.${NC}"
  exit 1
fi

# 13d. Verifica l'applicazione della patch aggiornata
echo -e "${YELLOW}Verifying and applying $OFFSET_ADD_PLUGIN_NAME after offset update...${NC}"
if ! $TAYLORED_CMD_BASE --verify-add "$OFFSET_ADD_PLUGIN_NAME"; then
  echo -e "${RED}Error: --verify-add for $OFFSET_ADD_PLUGIN_NAME failed after offset update.${NC}"
  exit 1
fi
$TAYLORED_CMD_BASE --add "$OFFSET_ADD_PLUGIN_NAME"

EXPECTED_CONTENT_AFTER_OFFSET_ADD_APPLY=$(cat << EOF
EXTRA PREPEND LINE X
EXTRA PREPEND LINE Y
Base line 1 for additions offset test
NEWLY ADDED LINE A
NEWLY ADDED LINE B
Base line 2 for additions offset test
EOF
)

if [ "$(cat "$OFFSET_ADD_FILE")" != "$EXPECTED_CONTENT_AFTER_OFFSET_ADD_APPLY" ]; then
  echo -e "${RED}Error: Content of $OFFSET_ADD_FILE is not as expected after applying offset-updated additions patch.${NC}"
  echo "Expected:"
  echo "$EXPECTED_CONTENT_AFTER_OFFSET_ADD_APPLY"
  echo "Got:"
  cat "$OFFSET_ADD_FILE"
  exit 1
fi
echo -e "${GREEN}Offset-updated additions patch $OFFSET_ADD_PLUGIN_NAME applied correctly.${NC}"
$TAYLORED_CMD_BASE --remove "$OFFSET_ADD_PLUGIN_NAME" &>/dev/null || true # Cleanup, ignore errors
git branch -D "$OFFSET_ADD_BRANCH" &>/dev/null || true
rm -f "$TAYLORED_DIR_NAME/$OFFSET_ADD_PLUGIN_NAME"
echo "----------------------------------------"

echo -e "${YELLOW}Step 14: Testing 'taylored --offset NAME --message \"CUSTOM\"' and 'taylored --data NAME'...${NC}"
git checkout main
git reset --hard HEAD # Assicura uno stato pulito di main

# 14a. Setup per il test di offset con messaggio custom
OFFSET_MSG_FILE="offset_message_test_file.txt"
OFFSET_MSG_BRANCH="message-offset-branch"
OFFSET_MSG_PLUGIN_NAME="${OFFSET_MSG_BRANCH}.taylored"
CUSTOM_MESSAGE="match random" # Messaggio da testare

# Creazione file base
cat << EOF > "$OFFSET_MSG_FILE"
Line 1 for custom message offset test
Line 2 for custom message offset test
EOF
git add "$OFFSET_MSG_FILE"
git commit -m "Initial content for custom message offset test file on main"

# Creazione branch e modifica per generare il plugin
git checkout -b "$OFFSET_MSG_BRANCH"
cat << EOF > "$OFFSET_MSG_FILE"
Line 1 for custom message offset test
ADDED LINE for custom message
Line 2 for custom message offset test
EOF
git add "$OFFSET_MSG_FILE"
git commit -m "Modifications on $OFFSET_MSG_BRANCH for custom message test"

# Creazione del plugin .taylored
git checkout main
$TAYLORED_CMD_BASE --save "$OFFSET_MSG_BRANCH"
if [ ! -f "$TAYLORED_DIR_NAME/$OFFSET_MSG_PLUGIN_NAME" ]; then
  echo -e "${RED}Error: Failed to create $OFFSET_MSG_PLUGIN_NAME for custom message offset test.${NC}"
  exit 1
fi
echo -e "${GREEN}Plugin $OFFSET_MSG_PLUGIN_NAME created for custom message offset test.${NC}"

# 14b. Modifica main per rompere gli offset originali
cat << EOF > "$OFFSET_MSG_FILE"
PREPENDED LINE 1 on main
PREPENDED LINE 2 on main
Line 1 for custom message offset test
Line 2 for custom message offset test
EOF
git add "$OFFSET_MSG_FILE"
git commit -m "Shift context on main for custom message offset test"

# 14c. Esegui taylored --offset con --message
echo -e "${YELLOW}Running 'taylored --offset $OFFSET_MSG_PLUGIN_NAME --message \"$CUSTOM_MESSAGE\"'...${NC}"
if $TAYLORED_CMD_BASE --offset "$OFFSET_MSG_PLUGIN_NAME" --message "$CUSTOM_MESSAGE"; then
  echo -e "${GREEN}'taylored --offset' with custom message completed successfully.${NC}"
else
  echo -e "${RED}Error: 'taylored --offset' with custom message failed.${NC}"
  exit 1
fi

# 14d. Verifica il messaggio con taylored --data
echo -e "${YELLOW}Running 'taylored --data $OFFSET_MSG_PLUGIN_NAME' to verify message...${NC}"
EXTRACTED_MESSAGE=$($TAYLORED_CMD_BASE --data "$OFFSET_MSG_PLUGIN_NAME")

if [ "$EXTRACTED_MESSAGE" = "$CUSTOM_MESSAGE" ]; then
  echo -e "${GREEN}'taylored --data' extracted the correct message: \"$EXTRACTED_MESSAGE\".${NC}"
else
  echo -e "${RED}Error: 'taylored --data' extracted an incorrect message.${NC}"
  echo -e "  Expected: \"$CUSTOM_MESSAGE\""
  echo -e "  Got:      \"$EXTRACTED_MESSAGE\""
  exit 1
fi

# 14e. Cleanup (opzionale: verifica applicazione, ma il focus è sul messaggio)
$TAYLORED_CMD_BASE --remove "$OFFSET_MSG_PLUGIN_NAME" &>/dev/null || true # Rimuovi se applicato, ignora errore se non applicato
git branch -D "$OFFSET_MSG_BRANCH" &>/dev/null || true
rm -f "$TAYLORED_DIR_NAME/$OFFSET_MSG_PLUGIN_NAME"
echo "----------------------------------------"

echo -e "${GREEN}All Taylored tests passed successfully!${NC}"

exit 0
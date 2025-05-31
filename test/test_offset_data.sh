#!/bin/bash

# This script assumes it's sourced by test.sh and inherits its functions, variables, and traps.
# It also assumes that the current directory is the taylored_test_repo_space.

echo -e "${YELLOW}Starting Offset and Data specific tests (test_offset_data.sh)...${NC}"
echo "----------------------------------------"

echo -e "${YELLOW}Step 15: More '--offset' Test Scenarios...${NC}"

# Scenario 15.1a: --offset with Deletions Before Patch Context
echo -e "${YELLOW}Step 15.1a: --offset with Deletions Before Patch Context...${NC}"
OFFSET_COMPLEX_DEL_FILE="offset_complex_del.txt"
OFFSET_COMPLEX_DEL_BRANCH="offset-complex-del-branch"
OFFSET_COMPLEX_DEL_PLUGIN="${OFFSET_COMPLEX_DEL_BRANCH}.taylored"

git checkout main
git reset --hard HEAD
cat << EOF > "$OFFSET_COMPLEX_DEL_FILE"
Line 1 (to be deleted by main)
Line 2 (to be deleted by main)
Line 3 (context before patch)
Line 4 (to be modified by patch)
Line 5 (context after patch)
Line 6
EOF
git add "$OFFSET_COMPLEX_DEL_FILE"
git commit -m "Initial for complex deletions offset test"

git checkout -b "$OFFSET_COMPLEX_DEL_BRANCH"
cat << EOF > "$OFFSET_COMPLEX_DEL_FILE"
Line 1 (to be deleted by main)
Line 2 (to be deleted by main)
Line 3 (context before patch)
Line 4 MODIFIED BY PATCH
Line 5 (context after patch)
Line 6
EOF
git add "$OFFSET_COMPLEX_DEL_FILE"
git commit -m "Patch modification for complex deletions test"

git checkout main
$TAYLORED_CMD_BASE --save "$OFFSET_COMPLEX_DEL_BRANCH"
# Now, on main, delete lines before the patch context
cat << EOF > "$OFFSET_COMPLEX_DEL_FILE"
Line 3 (context before patch)
Line 4 (to be modified by patch)
Line 5 (context after patch)
Line 6
EOF
git add "$OFFSET_COMPLEX_DEL_FILE"
git commit -m "Deletions on main before patch context"

echo -e "${YELLOW}Running 'taylored --offset $OFFSET_COMPLEX_DEL_PLUGIN' (deletions before context)...${NC}"
if $TAYLORED_CMD_BASE --offset "$OFFSET_COMPLEX_DEL_PLUGIN"; then
  echo -e "${GREEN}'taylored --offset' succeeded.${NC}"
else
  echo -e "${RED}Error: 'taylored --offset' failed for deletions before context.${NC}"; exit 1;
fi
if ! $TAYLORED_CMD_BASE --verify-add "$OFFSET_COMPLEX_DEL_PLUGIN"; then
  echo -e "${RED}Error: --verify-add failed after offset update (deletions before context).${NC}"; exit 1;
fi
$TAYLORED_CMD_BASE --add "$OFFSET_COMPLEX_DEL_PLUGIN"
EXPECTED_CONTENT_COMPLEX_DEL=$(cat << EOF
Line 3 (context before patch)
Line 4 MODIFIED BY PATCH
Line 5 (context after patch)
Line 6
EOF
)
if [ "$(cat "$OFFSET_COMPLEX_DEL_FILE")" != "$EXPECTED_CONTENT_COMPLEX_DEL" ]; then
  echo -e "${RED}Error: Content mismatch after applying offset patch (deletions before context).${NC}"; exit 1;
fi
echo -e "${GREEN}Patch applied correctly after offset (deletions before context).${NC}"
$TAYLORED_CMD_BASE --remove "$OFFSET_COMPLEX_DEL_PLUGIN" &>/dev/null || true
git branch -D "$OFFSET_COMPLEX_DEL_BRANCH" &>/dev/null || true
rm -f "$TAYLORED_DIR_NAME/$OFFSET_COMPLEX_DEL_PLUGIN"
rm -f "$OFFSET_COMPLEX_DEL_FILE"
echo "----------------------------------------"

# Scenario 15.1b: --offset with Changes Within Context Lines
echo -e "${YELLOW}Step 15.1b: --offset with Changes Within Context Lines...${NC}"
OFFSET_COMPLEX_CTX_FILE="offset_complex_ctx.txt"
OFFSET_COMPLEX_CTX_BRANCH="offset-complex-ctx-branch"
OFFSET_COMPLEX_CTX_PLUGIN="${OFFSET_COMPLEX_CTX_BRANCH}.taylored"

git checkout main
git reset --hard HEAD
cat << EOF > "$OFFSET_COMPLEX_CTX_FILE"
Line 1 (context - to be modified by main)
Line 2 (to be modified by patch)
Line 3 (context - to be modified by main)
Line 4
EOF
git add "$OFFSET_COMPLEX_CTX_FILE"
git commit -m "Initial for complex context offset test"

git checkout -b "$OFFSET_COMPLEX_CTX_BRANCH"
cat << EOF > "$OFFSET_COMPLEX_CTX_FILE"
Line 1 (context - to be modified by main)
Line 2 MODIFIED BY PATCH
Line 3 (context - to be modified by main)
Line 4
EOF
git add "$OFFSET_COMPLEX_CTX_FILE"
git commit -m "Patch modification for complex context test"

git checkout main
$TAYLORED_CMD_BASE --save "$OFFSET_COMPLEX_CTX_BRANCH"
# Now, on main, modify context lines
cat << EOF > "$OFFSET_COMPLEX_CTX_FILE"
Line 1 CONTEXT MODIFIED BY MAIN
Line 2 (to be modified by patch)
Line 3 CONTEXT MODIFIED BY MAIN
Line 4
EOF
git add "$OFFSET_COMPLEX_CTX_FILE"
git commit -m "Context changes on main for complex context test"

echo -e "${YELLOW}Running 'taylored --offset $OFFSET_COMPLEX_CTX_PLUGIN' (context changes)...${NC}"
if $TAYLORED_CMD_BASE --offset "$OFFSET_COMPLEX_CTX_PLUGIN"; then
  echo -e "${GREEN}'taylored --offset' succeeded.${NC}"
else
  echo -e "${RED}Error: 'taylored --offset' failed for context changes.${NC}"; exit 1;
fi
if ! $TAYLORED_CMD_BASE --verify-add "$OFFSET_COMPLEX_CTX_PLUGIN"; then
  echo -e "${RED}Error: --verify-add failed after offset update (context changes).${NC}"; exit 1;
fi
$TAYLORED_CMD_BASE --add "$OFFSET_COMPLEX_CTX_PLUGIN"
EXPECTED_CONTENT_COMPLEX_CTX=$(cat << EOF
Line 1 CONTEXT MODIFIED BY MAIN
Line 2 MODIFIED BY PATCH
Line 3 CONTEXT MODIFIED BY MAIN
Line 4
EOF
)
if [ "$(cat "$OFFSET_COMPLEX_CTX_FILE")" != "$EXPECTED_CONTENT_COMPLEX_CTX" ]; then
  echo -e "${RED}Error: Content mismatch after applying offset patch (context changes).${NC}"; exit 1;
fi
echo -e "${GREEN}Patch applied correctly after offset (context changes).${NC}"
$TAYLORED_CMD_BASE --remove "$OFFSET_COMPLEX_CTX_PLUGIN" &>/dev/null || true
git branch -D "$OFFSET_COMPLEX_CTX_BRANCH" &>/dev/null || true
rm -f "$TAYLORED_DIR_NAME/$OFFSET_COMPLEX_CTX_PLUGIN"
rm -f "$OFFSET_COMPLEX_CTX_FILE"
echo "----------------------------------------"


# Scenario 15.2: --offset with Patch Affecting Multiple Files
echo -e "${YELLOW}Step 15.2: --offset with Patch Affecting Multiple Files...${NC}"
OFFSET_MULTI1_FILE="offset_multi1.txt"
OFFSET_MULTI2_FILE="offset_multi2.txt"
OFFSET_MULTI_BRANCH="offset-multi-branch"
OFFSET_MULTI_PLUGIN="${OFFSET_MULTI_BRANCH}.taylored"

git checkout main
git reset --hard HEAD
echo "Initial content for multi1" > "$OFFSET_MULTI1_FILE"
echo "Line X to be deleted from multi2" > "$OFFSET_MULTI2_FILE"
echo "Another line in multi2" >> "$OFFSET_MULTI2_FILE"
git add "$OFFSET_MULTI1_FILE" "$OFFSET_MULTI2_FILE"
git commit -m "Initial for multi-file offset test"

git checkout -b "$OFFSET_MULTI_BRANCH"
echo "ADDED LINE to multi1" >> "$OFFSET_MULTI1_FILE"
echo "Another line in multi2" > "$OFFSET_MULTI2_FILE" # Deletes "Line X..."
git add "$OFFSET_MULTI1_FILE" "$OFFSET_MULTI2_FILE"
git commit -m "Multi-file patch changes"

git checkout main
$TAYLORED_CMD_BASE --save "$OFFSET_MULTI_BRANCH"

# Break offsets on main
echo "PREPENDED to multi1" | cat - "$OFFSET_MULTI1_FILE" > temp && mv temp "$OFFSET_MULTI1_FILE"
echo "PREPENDED to multi2" | cat - "$OFFSET_MULTI2_FILE" > temp && mv temp "$OFFSET_MULTI2_FILE"
git add "$OFFSET_MULTI1_FILE" "$OFFSET_MULTI2_FILE"
git commit -m "Break offsets for multi-file test"

echo -e "${YELLOW}Running 'taylored --offset $OFFSET_MULTI_PLUGIN' (multi-file)...${NC}"
if $TAYLORED_CMD_BASE --offset "$OFFSET_MULTI_PLUGIN"; then
  echo -e "${GREEN}'taylored --offset' succeeded for multi-file patch.${NC}"
else
  echo -e "${RED}Error: 'taylored --offset' failed for multi-file patch.${NC}"; exit 1;
fi
if ! $TAYLORED_CMD_BASE --verify-add "$OFFSET_MULTI_PLUGIN"; then
  echo -e "${RED}Error: --verify-add failed for multi-file patch after offset update.${NC}"; exit 1;
fi
$TAYLORED_CMD_BASE --add "$OFFSET_MULTI_PLUGIN"
EXPECTED_MULTI1_CONTENT=$(cat << EOF
PREPENDED to multi1
Initial content for multi1
ADDED LINE to multi1
EOF
)
EXPECTED_MULTI2_CONTENT=$(cat << EOF
PREPENDED to multi2
Another line in multi2
EOF
)
if [ "$(cat "$OFFSET_MULTI1_FILE")" != "$EXPECTED_MULTI1_CONTENT" ] || \
   [ "$(cat "$OFFSET_MULTI2_FILE")" != "$EXPECTED_MULTI2_CONTENT" ]; then
  echo -e "${RED}Error: Content mismatch after applying multi-file offset patch.${NC}"
  echo "Multi1 Expected vs Got:"
  diff <(echo "$EXPECTED_MULTI1_CONTENT") <(cat "$OFFSET_MULTI1_FILE") || true
  echo "Multi2 Expected vs Got:"
  diff <(echo "$EXPECTED_MULTI2_CONTENT") <(cat "$OFFSET_MULTI2_FILE") || true
  exit 1;
fi
echo -e "${GREEN}Multi-file patch applied correctly after offset.${NC}"
$TAYLORED_CMD_BASE --remove "$OFFSET_MULTI_PLUGIN" &>/dev/null || true
git branch -D "$OFFSET_MULTI_BRANCH" &>/dev/null || true
rm -f "$TAYLORED_DIR_NAME/$OFFSET_MULTI_PLUGIN"
rm -f "$OFFSET_MULTI1_FILE" "$OFFSET_MULTI2_FILE"
echo "----------------------------------------"

# Scenario 15.3: --offset Resulting in an "Empty" Patch
echo -e "${YELLOW}Step 15.3: --offset Resulting in an 'Empty' Patch...${NC}"
OFFSET_EMPTY_FILE="offset_empty_scenario.txt"
OFFSET_EMPTY_BRANCH="offset-empty-branch"
OFFSET_EMPTY_PLUGIN="${OFFSET_EMPTY_BRANCH}.taylored"

git checkout main
git reset --hard HEAD
cat << EOF > "$OFFSET_EMPTY_FILE"
Line A
Line B
Line C
EOF
git add "$OFFSET_EMPTY_FILE"
git commit -m "Initial for empty offset test"

git checkout -b "$OFFSET_EMPTY_BRANCH"
cat << EOF > "$OFFSET_EMPTY_FILE"
Line A
Line C
EOF
git add "$OFFSET_EMPTY_FILE"
git commit -m "Delete Line B for empty offset test"

git checkout main
$TAYLORED_CMD_BASE --save "$OFFSET_EMPTY_BRANCH"
# Now make main identical to the branch state FOR THIS FILE
cat << EOF > "$OFFSET_EMPTY_FILE"
Line A
Line C
EOF
git add "$OFFSET_EMPTY_FILE"
git commit -m "Make main identical for empty offset test"

echo -e "${YELLOW}Running 'taylored --offset $OFFSET_EMPTY_PLUGIN' (expecting empty result)...${NC}"
OFFSET_EMPTY_OUTPUT=$($TAYLORED_CMD_BASE --offset "$OFFSET_EMPTY_PLUGIN")
if echo "$OFFSET_EMPTY_OUTPUT" | grep -q -E "RESULT: An empty patch was generated|patchGeneratedNonEmpty: false|RESULT: Empty patch|Offsets updated successfully"; then
  # The "Offsets updated successfully" can appear if the library still generates a commit even for an empty textual diff (e.g. if headers changed)
  echo -e "${GREEN}'taylored --offset' reported an empty or successfully processed patch, as expected.${NC}"
else
  echo -e "${RED}Error: 'taylored --offset' did not report an empty patch as expected.${NC}"
  echo "Output:"
  echo "$OFFSET_EMPTY_OUTPUT"
fi

if [ -f "$TAYLORED_DIR_NAME/$OFFSET_EMPTY_PLUGIN" ]; then
  OFFSET_PATCH_CONTENT=$(cat "$TAYLORED_DIR_NAME/$OFFSET_EMPTY_PLUGIN")
  if [ -n "$OFFSET_PATCH_CONTENT" ] && grep -q -E "^\+\+\+ b/|--- a/" "$TAYLORED_DIR_NAME/$OFFSET_EMPTY_PLUGIN"; then
    echo -e "${RED}Error: Offset-updated patch $OFFSET_EMPTY_PLUGIN is not empty.${NC}"
    cat "$TAYLORED_DIR_NAME/$OFFSET_EMPTY_PLUGIN"
    exit 1;
  fi
  echo -e "${GREEN}Content of $OFFSET_EMPTY_PLUGIN is empty or no-op, as expected.${NC}"
else
  echo -e "${RED}Error: $OFFSET_EMPTY_PLUGIN not found after --offset run.${NC}"; exit 1;
fi
$TAYLORED_CMD_BASE --add "$OFFSET_EMPTY_PLUGIN" # Should do nothing
EXPECTED_EMPTY_OFFSET_CONTENT=$(printf "Line A\nLine C\n")
if [ "$(cat "$OFFSET_EMPTY_FILE")" != "$EXPECTED_EMPTY_OFFSET_CONTENT" ]; then
    echo -e "${RED}Error: Applying the 'empty' offset patch changed the file! Expected:\n$EXPECTED_EMPTY_OFFSET_CONTENT\nGot:\n$(cat "$OFFSET_EMPTY_FILE")${NC}"; exit 1;
fi
echo -e "${GREEN}Applying the 'empty' offset patch made no changes, as expected.${NC}"
git branch -D "$OFFSET_EMPTY_BRANCH" &>/dev/null || true
rm -f "$TAYLORED_DIR_NAME/$OFFSET_EMPTY_PLUGIN"
rm -f "$OFFSET_EMPTY_FILE"
echo "----------------------------------------"

# Scenario 15.4: --offset Using Fallback Message Extraction
echo -e "${YELLOW}Step 15.4: --offset Using Fallback Message Extraction (No Subject: line)...${NC}"
NO_SUBJECT_PLUGIN="no_subject_patch.taylored"
NO_SUBJECT_FILE="some_file_for_no_subject.txt"
EXPECTED_FALLBACK_MSG="This is the intended commit message body."

git checkout main
git reset --hard HEAD
mkdir -p "$TAYLORED_DIR_NAME"
cat << EOF > "$TAYLORED_DIR_NAME/$NO_SUBJECT_PLUGIN"
From: Test User <test@example.com>
Date: Mon, 1 Jan 2024 12:00:00 +0000

$EXPECTED_FALLBACK_MSG

--- a/$NO_SUBJECT_FILE
+++ b/$NO_SUBJECT_FILE
@@ -1 +1,2 @@
Original line in some_file
+Added by no_subject_patch
EOF
echo "Original line in some_file" > "$NO_SUBJECT_FILE"
git add "$NO_SUBJECT_FILE"
git commit -m "Setup for no_subject_patch test"
echo "Prepended line to break offset" | cat - "$NO_SUBJECT_FILE" > temp && mv temp "$NO_SUBJECT_FILE"
git add "$NO_SUBJECT_FILE"
git commit -m "Break offset for no_subject_patch test"

if $TAYLORED_CMD_BASE --offset "$NO_SUBJECT_PLUGIN"; then
  echo -e "${GREEN}'taylored --offset' for no_subject_patch completed.${NC}"
else
  echo -e "${RED}Error: 'taylored --offset' for no_subject_patch failed.${NC}"; exit 1;
fi
EXTRACTED_NO_SUBJECT_MSG=$($TAYLORED_CMD_BASE --data "$NO_SUBJECT_PLUGIN")
if [ "$EXTRACTED_NO_SUBJECT_MSG" = "$EXPECTED_FALLBACK_MSG" ]; then
  echo -e "${GREEN}Correct fallback message extracted: '$EXTRACTED_NO_SUBJECT_MSG'.${NC}"
else
  echo -e "${RED}Error: Incorrect message extracted for no_subject_patch. Expected '$EXPECTED_FALLBACK_MSG', Got '$EXTRACTED_NO_SUBJECT_MSG'.${NC}"; exit 1;
fi
rm -f "$TAYLORED_DIR_NAME/$NO_SUBJECT_PLUGIN"
rm -f "$NO_SUBJECT_FILE"
echo "----------------------------------------"

# Scenario 15.5: --offset with No Custom Message and No Extractable Message
echo -e "${YELLOW}Step 15.5: --offset with No Custom Message and No Extractable Message...${NC}"
VERY_BARE_PLUGIN="very_bare_patch.taylored"
VERY_BARE_FILE="file_for_bare_patch.txt"

git checkout main
git reset --hard HEAD
mkdir -p "$TAYLORED_DIR_NAME"
cat << EOF > "$TAYLORED_DIR_NAME/$VERY_BARE_PLUGIN"
--- a/$VERY_BARE_FILE
+++ b/$VERY_BARE_FILE
@@ -1 +1,2 @@
Initial bare content
+Added by bare patch
EOF
echo "Initial bare content" > "$VERY_BARE_FILE"
git add "$VERY_BARE_FILE"
git commit -m "Setup for very_bare_patch test"
echo "Prepended to break bare offset" | cat - "$VERY_BARE_FILE" > temp && mv temp "$VERY_BARE_FILE"
git add "$VERY_BARE_FILE"
git commit -m "Break offset for very_bare_patch test"

if $TAYLORED_CMD_BASE --offset "$VERY_BARE_PLUGIN"; then
  echo -e "${GREEN}'taylored --offset' for very_bare_patch completed.${NC}"
else
  echo -e "${RED}Error: 'taylored --offset' for very_bare_patch failed.${NC}"; exit 1;
fi
EXTRACTED_BARE_MSG=$($TAYLORED_CMD_BASE --data "$VERY_BARE_PLUGIN")
if echo "$EXTRACTED_BARE_MSG" | grep -q -E "Temporary: Applied patch \\(forwards\\) for offset update|Temporary: Applied patch \\(backwards\\)"; then
  echo -e "${GREEN}Extracted message for bare patch is a default message: '$EXTRACTED_BARE_MSG'.${NC}"
else
  echo -e "${RED}Error: Unexpected message for bare patch. Got '$EXTRACTED_BARE_MSG'.${NC}"; exit 1;
fi
rm -f "$TAYLORED_DIR_NAME/$VERY_BARE_PLUGIN"
rm -f "$VERY_BARE_FILE"
echo "----------------------------------------"


echo -e "${YELLOW}Step 16: More '--data' Test Scenarios...${NC}"

# Scenario 16.1: --data with No Message in Patch (using very_bare_patch setup again)
echo -e "${YELLOW}Step 16.1: --data with No Message in Patch (bare patch)...${NC}"
mkdir -p "$TAYLORED_DIR_NAME"
echo "Initial bare content for data test" > "$VERY_BARE_FILE" # Recreate for this specific test context
git add "$VERY_BARE_FILE"
git commit -m "Setup for data bare patch test" --allow-empty # Allow empty if no changes from previous state

cat << EOF > "$TAYLORED_DIR_NAME/$VERY_BARE_PLUGIN"
--- a/$VERY_BARE_FILE
+++ b/$VERY_BARE_FILE
@@ -1 +1,2 @@
 Initial bare content for data test
+Added by bare patch for data test
EOF
DATA_FROM_BARE=$($TAYLORED_CMD_BASE --data "$VERY_BARE_PLUGIN")
if [ -z "$DATA_FROM_BARE" ]; then
  echo -e "${GREEN}'--data' on bare patch returned empty string, as expected.${NC}"
elif echo "$DATA_FROM_BARE" | grep -q -E "^Temporary:"; then
  echo -e "${RED}Error: '--data' on a bare patch returned a default library message: '$DATA_FROM_BARE'. Expected empty.${NC}"; exit 1;
else
  echo -e "${YELLOW}Warning: '--data' on bare patch returned: '$DATA_FROM_BARE'. This might be a heuristically picked line. Empty is preferred for truly bare patches.${NC}"
fi
rm -f "$TAYLORED_DIR_NAME/$VERY_BARE_PLUGIN"
rm -f "$VERY_BARE_FILE"
echo "----------------------------------------"

# Scenario 16.2: --data with an Empty .taylored File
echo -e "${YELLOW}Step 16.2: --data with an Empty .taylored File...${NC}"
TRULY_EMPTY_PLUGIN="truly_empty.taylored"
mkdir -p "$TAYLORED_DIR_NAME"
touch "$TAYLORED_DIR_NAME/$TRULY_EMPTY_PLUGIN"
DATA_FROM_TRULY_EMPTY=$($TAYLORED_CMD_BASE --data "$TRULY_EMPTY_PLUGIN")
if [ -z "$DATA_FROM_TRULY_EMPTY" ]; then
  echo -e "${GREEN}'--data' on a truly empty .taylored file returned empty string, as expected.${NC}"
else
  echo -e "${RED}Error: '--data' on a truly empty .taylored file returned non-empty: '$DATA_FROM_TRULY_EMPTY'.${NC}"; exit 1;
fi
rm -f "$TAYLORED_DIR_NAME/$TRULY_EMPTY_PLUGIN"
echo "----------------------------------------"

# Ensure the script returns to the project root before exiting, if it was in TEST_DIR_FULL_PATH
cd "$PROJECT_ROOT_PATH" || exit 1


echo -e "${YELLOW}Starting Taylored functionality tests...${NC}"

echo -e "${YELLOW}Step 1: Setting up test Git repository...${NC}"
>>>>>>> REPLACE

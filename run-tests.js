const { spawn } = require('child_process');
const path = require('path');

const testScriptPath = path.join(__dirname, 'tests', 'test.sh');

// Determine the shell to use. On Windows, Git Bash or WSL bash is preferred.
// For simplicity, we'll assume 'bash' is in the PATH and correctly configured.
const shell = 'bash';

console.log(`Attempting to run: ${shell} ${testScriptPath}`);

const testProcess = spawn(shell, [testScriptPath], {
  stdio: 'inherit', // Show output in real-time
  shell: true // Use shell interpretation for 'bash' command
});

testProcess.on('error', (error) => {
  console.error(`Failed to start test process: ${error.message}`);
  process.exit(1);
});

testProcess.on('exit', (code) => {
  if (code !== 0) {
    console.error(`Test script exited with code ${code}`);
  } else {
    console.log('Test script completed successfully.');
  }
  process.exit(code);
});

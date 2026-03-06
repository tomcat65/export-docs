/**
 * Firebase Functions deployment script
 * 
 * This script helps you deploy Firebase Functions with the correct environment variables.
 */

const { execSync } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Ask a question and return the answer
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Run a command and log output
function runCommand(command) {
  try {
    console.log(`Running: ${command}`);
    const output = execSync(command, { encoding: 'utf8' });
    console.log(output);
    return output;
  } catch (error) {
    console.error(`Error executing command: ${command}`);
    console.error(error.stdout || error.message);
    throw error;
  }
}

// Main deployment function
async function deploy() {
  console.log('==== Firebase Functions Deployment ====');
  
  try {
    // Check if Firebase CLI is installed
    try {
      execSync('firebase --version', { encoding: 'utf8' });
    } catch (error) {
      console.error('Firebase CLI not found. Please install it with npm install -g firebase-tools');
      process.exit(1);
    }
    
    // Check if user is logged in
    try {
      const account = execSync('firebase login:list', { encoding: 'utf8' });
      if (!account.includes('✔')) {
        console.log('You are not logged in to Firebase. Please login first.');
        runCommand('firebase login');
      }
    } catch (error) {
      console.log('Error checking login status. Trying to login...');
      runCommand('firebase login');
    }
    
    // Read environment variables from .env file
    let mongoUri = '';
    let anthropicApiKey = '';
    
    // Check if .env file exists in functions directory
    const envPath = path.join(__dirname, 'functions', '.env');
    if (fs.existsSync(envPath)) {
      const envFile = fs.readFileSync(envPath, 'utf8');
      const envVars = envFile.split('\n');
      
      for (const line of envVars) {
        if (line.startsWith('MONGODB_URI=')) {
          mongoUri = line.substring('MONGODB_URI='.length);
        } else if (line.startsWith('ANTHROPIC_API_KEY=')) {
          anthropicApiKey = line.substring('ANTHROPIC_API_KEY='.length);
        }
      }
    }
    
    // If environment variables are not found in .env, ask user for them
    if (!mongoUri) {
      mongoUri = await askQuestion('Enter MongoDB URI: ');
    } else {
      console.log('Found MongoDB URI in .env file');
      const useExisting = await askQuestion('Use existing MongoDB URI? (y/n): ');
      if (useExisting.toLowerCase() !== 'y') {
        mongoUri = await askQuestion('Enter MongoDB URI: ');
      }
    }
    
    if (!anthropicApiKey) {
      anthropicApiKey = await askQuestion('Enter Anthropic API Key: ');
    } else {
      console.log('Found Anthropic API Key in .env file');
      const useExisting = await askQuestion('Use existing Anthropic API Key? (y/n): ');
      if (useExisting.toLowerCase() !== 'y') {
        anthropicApiKey = await askQuestion('Enter Anthropic API Key: ');
      }
    }
    
    // Set environment variables in Firebase Functions config
    console.log('Setting environment variables in Firebase Functions config...');
    
    runCommand(`firebase functions:config:set mongodb.uri="${mongoUri}"`);
    runCommand(`firebase functions:config:set anthropic.apikey="${anthropicApiKey}"`);
    runCommand(`firebase functions:config:set environment.mode="production"`);
    
    // Check if environment variables are set correctly
    console.log('Checking environment variables...');
    const config = runCommand('firebase functions:config:get');
    
    if (!config.includes('mongodb') || !config.includes('anthropic')) {
      console.error('Environment variables were not set correctly. Please try again.');
      process.exit(1);
    }
    
    // Ask user what to deploy
    const deployWhat = await askQuestion('What do you want to deploy? (functions/storage/all): ');
    
    // Deploy based on user choice
    if (deployWhat.toLowerCase() === 'functions') {
      runCommand('firebase deploy --only functions');
    } else if (deployWhat.toLowerCase() === 'storage') {
      runCommand('firebase deploy --only storage');
    } else {
      runCommand('firebase deploy');
    }
    
    console.log('==== Deployment Complete ====');
  } catch (error) {
    console.error('Deployment failed:', error);
  } finally {
    rl.close();
  }
}

// Run the deployment function
deploy().catch(console.error); 
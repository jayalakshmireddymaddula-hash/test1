import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import dotenv from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend/.env
const envPath = path.join(__dirname, '../.env');
dotenv.config({ path: envPath });

const { Client } = pg;

function promptPassword(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function extractProjectRef(supabaseUrl) {
  if (!supabaseUrl) return null;
  const match = supabaseUrl.match(/https:\/\/([a-z0-9_-]+)\.supabase\.co/i);
  return match ? match[1] : null;
}

async function runMigration() {
  console.log('\n======================================================');
  console.log('⚡ Supabase Database Migration Runner');
  console.log('======================================================\n');

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const projectRef = extractProjectRef(supabaseUrl) || 'dxbdduyfjyrpsvunrzst';

  let connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    let dbPassword = process.env.DATABASE_PASSWORD || process.env.SUPABASE_DB_PASSWORD;

    if (!dbPassword) {
      console.log(`📡 Supabase Project: ${projectRef}`);
      console.log('🔑 Database password not found in backend/.env.');
      console.log('   (This is the database password you chose when creating the Supabase project)\n');
      
      dbPassword = await promptPassword('👉 Enter your Supabase Database Password: ');
      
      if (!dbPassword) {
        console.error('❌ Database password is required to execute migrations.');
        console.log('\n💡 Tip: You can set DATABASE_PASSWORD=your_password in backend/.env');
        process.exit(1);
      }

      // Automatically append to backend/.env for convenience
      try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        if (!envContent.includes('DATABASE_PASSWORD=')) {
          fs.appendFileSync(envPath, `\n# Supabase Database Password\nDATABASE_PASSWORD=${dbPassword}\n`);
          console.log('💾 Saved DATABASE_PASSWORD to backend/.env (protected by .gitignore)');
        }
      } catch (err) {
        // Ignore file write errors
      }
    }

    // Direct Supabase Postgres host
    connectionString = `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`;
  }

  const migrationsDir = path.join(__dirname, '../../supabase/migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.error(`❌ Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }

  const sqlFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  if (sqlFiles.length === 0) {
    console.log('⚠️ No .sql migration files found in supabase/migrations.');
    process.exit(0);
  }

  console.log(`\n🔌 Connecting to Supabase database (db.${projectRef}.supabase.co)...`);

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });

  try {
    await client.connect();
    console.log('✅ Connected successfully to Supabase PostgreSQL!\n');

    for (const sqlFile of sqlFiles) {
      const filePath = path.join(migrationsDir, sqlFile);
      const sqlContent = fs.readFileSync(filePath, 'utf8');

      console.log(`📄 Executing migration: ${sqlFile}...`);
      await client.query(sqlContent);
      console.log(`✅ Successfully applied: ${sqlFile}`);
    }

    console.log('\n======================================================');
    console.log('🎉 All Supabase tables and policies created successfully!');
    console.log('   • Table "public.chat_sessions" ready');
    console.log('   • Table "public.messages" ready');
    console.log('   • Row Level Security & Indexes configured');
    console.log('======================================================\n');

  } catch (error) {
    console.error('\n❌ Migration failed:');
    if (error.code === '28P01' || error.message.includes('password authentication failed')) {
      console.error('👉 Error: Incorrect database password. Please check your password in Supabase Dashboard (Project Settings -> Database).');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      console.error('👉 Error: Network timeout connecting to Supabase database host.');
      console.error('   Supabase connection pooler fallback: If direct 5432 port is blocked on your network, use connection pooling:');
      console.error(`   DATABASE_URL=postgresql://postgres.${projectRef}:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

runMigration();

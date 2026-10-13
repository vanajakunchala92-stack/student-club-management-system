const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');

dotenv.config();
const rl = readline.createInterface({ input, output });
(async () => {
  let pool;
  try {
    const roleInput = (await rl.question('Staff role (admin/coordinator): ')).trim().toLowerCase();
    if (!['admin', 'coordinator'].includes(roleInput)) throw new Error('Role must be admin or coordinator.');
    const name = (await rl.question('Full name: ')).trim();
    const username = (await rl.question('Username (3-30 characters): ')).trim();
    const email = (await rl.question('Email: ')).trim().toLowerCase();
    const phone = (await rl.question('Phone (optional): ')).trim();
    const password = await rl.question('Password (at least 8 characters): ');
    if (!name || !/^[A-Za-z0-9_.-]{3,30}$/.test(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 72) {
      throw new Error('Invalid details. Check name, username, email, and password length.');
    }
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'scem_db'
    });
    const hash = await bcrypt.hash(password, 12);
    await pool.execute('INSERT INTO users (name, username, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)', [name, username, email, phone || null, hash, roleInput]);
    console.log(`${roleInput} account created successfully. Keep the credentials private.`);
  } catch (err) {
    console.error('Could not create staff account:', err.code === 'ER_DUP_ENTRY' ? 'Username or email already exists.' : err.message);
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end();
    rl.close();
  }
})();

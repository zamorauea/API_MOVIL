require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const fetch = require('node-fetch');
const DataLoader = require('dataloader'); // Agregar DataLoader

const app = express();
app.use(express.json());

// Conexión a PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
});

// ---------------- CACHÉ SIMPLE (opcional) ----------------
const cache = {};

// ---------------- DATA LOADER PARA CLIENTES ----------------
const clienteLoader = new DataLoader(async (ids) => {
  console.log(`⚡ Consultando DB clientes [${ids}] (batched)`); // log batched
  const { rows } = await pool.query('SELECT * FROM clientes WHERE id = ANY($1)', [ids]);
  // Mapear resultados en el mismo orden que los IDs
  return ids.map(id => rows.find(r => r.id === id));
});

// ---------------- ENDPOINT CLIENTES ----------------
app.get('/api/v1/clientes', async (req, res) => {
  const key = 'clientes';
  console.time('TiempoClientes');

  if (cache[key]) {
    console.log('📌 Usando caché clientes');
    console.timeEnd('TiempoClientes');
    return res.json(cache[key]);
  }

  try {
    console.log('⚡ Consultando DB clientes');
    const respuesta = await pool.query('SELECT * FROM clientes');
    cache[key] = respuesta.rows;
    console.timeEnd('TiempoClientes');
    res.json(respuesta.rows);
  } catch (error) {
    console.timeEnd('TiempoClientes');
    res.status(500).json({ mensaje: 'Error clientes', detalle: error.message });
  }
});

// ---------------- ENDPOINT EQUIPOS ----------------
app.get('/api/v1/equipos', async (req, res) => {
  const key = 'equipos';
  console.time('TiempoEquipos');

  if (cache[key]) {
    console.log('📌 Usando caché equipos');
    console.timeEnd('TiempoEquipos');
    return res.json(cache[key]);
  }

  try {
    console.log('⚡ Consultando DB equipos');
    const respuesta = await pool.query('SELECT * FROM equipos');
    cache[key] = respuesta.rows;
    console.timeEnd('TiempoEquipos');
    res.json(respuesta.rows);
  } catch (error) {
    console.timeEnd('TiempoEquipos');
    res.status(500).json({ mensaje: 'Error equipos', detalle: error.message });
  }
});

// ---------------- ENDPOINT ORDENES CON DATA LOADER ----------------
app.get('/api/v1/ordenes', async (req, res) => {
  console.time('TiempoOrdenes');
  try {
    console.log('⚡ Consultando DB ordenes');
    const respuesta = await pool.query('SELECT * FROM orden_servicio');

    // Evitar N+1: cargar clientes usando DataLoader
    for (let orden of respuesta.rows) {
      orden.cliente = await clienteLoader.load(orden.cliente_id);
    }

    console.timeEnd('TiempoOrdenes');
    res.json(respuesta.rows);
  } catch (error) {
    console.timeEnd('TiempoOrdenes');
    res.status(500).json({ mensaje: 'Error ordenes', detalle: error.message });
  }
});

// ---------------- ENDPOINT CLIMA ----------------
app.get('/api/v1/clima/:ciudad', async (req, res) => {
  const { ciudad } = req.params;
  const key = `clima-${ciudad.toLowerCase()}`;
  console.time(`TiempoClima-${ciudad}`);

  if (cache[key]) {
    console.log(`📌 Usando caché clima ${ciudad}`);
    console.timeEnd(`TiempoClima-${ciudad}`);
    return res.json(cache[key]);
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${ciudad}&appid=${process.env.API_EXTERNA_KEY}&units=metric&lang=es`;
    const datos = await (await fetch(url)).json();
    cache[key] = datos;
    console.log(`⚡ Consultando API clima ${ciudad}`);
    console.timeEnd(`TiempoClima-${ciudad}`);
    res.json(datos);
  } catch (error) {
    console.timeEnd(`TiempoClima-${ciudad}`);
    res.status(500).json({ error: 'No se pudo obtener clima', detalle: error.message });
  }
});

// ---------------- INICIAR SERVIDOR ----------------
app.listen(3000, () => {
  console.log('¡Todo listo en http://localhost:3000!');
});
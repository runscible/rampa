// Every test gets its own throwaway database, never the real file the server uses.
process.env.RECON_DB_PATH = ':memory:';

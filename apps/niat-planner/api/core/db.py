import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def get_db_connection():
    if not DATABASE_URL:
        raise Exception("DATABASE_URL not found in environment")
    
    # Handle potentially different URL formats if needed
    conn = psycopg2.connect(DATABASE_URL)
    return conn

def execute_query(query, params=None, fetch=False):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            if fetch:
                return cur.fetchall()
            conn.commit()
    finally:
        conn.close()

def execute_insert(query, params=None):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            last_id = None
            try:
                last_id = cur.fetchone()[0]
            except:
                pass
            conn.commit()
            return last_id
    finally:
        conn.close()

import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Try to load from root if not found in local dir
load_dotenv()
if not os.getenv("DATABASE_URL"):
    load_dotenv(os.path.join(os.getcwd(), "../../.env"))
if not os.getenv("DATABASE_URL"):
    load_dotenv(os.path.join(os.getcwd(), "../../../.env"))

def get_db_connection():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise Exception("DATABASE_URL not found in environment. Please check Railway variables.")
    
    # Handle potentially different URL formats if needed
    conn = psycopg2.connect(db_url)
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

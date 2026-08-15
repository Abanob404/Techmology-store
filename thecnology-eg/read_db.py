import sqlite3
try:
    conn = sqlite3.connect(r'C:\Users\azakarya\OneDrive - Manazel Real Estate Developments\Desktop\technology_pos_backup.db')
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    print('Tables:', cur.fetchall())
    cur.execute("PRAGMA table_info(items)")
    print('Items Columns:', [row[1] for row in cur.fetchall()])
    cur.execute("SELECT * FROM items LIMIT 1")
    print('Sample:', cur.fetchone())
except Exception as e:
    print(e)

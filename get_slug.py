import sqlite3
import os

db_path = r'd:\VENDA\IZAQUE CAMPESTRE\Saas-Restaurante\server\database\deliveryhub.sqlite'
if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT slug FROM tenants LIMIT 1")
    row = cursor.fetchone()
    if row:
        print(row[0])
    else:
        print("Nenhum tenant encontrado")
    conn.close()
else:
    print(f"Banco não encontrado em {db_path}")

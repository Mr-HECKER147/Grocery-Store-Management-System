import pymysql
from flask import g
import os
import logging

logger = logging.getLogger(__name__)

# Database configuration - use environment variables in production
MYSQL_CONFIG = {
    'host': os.environ.get('MYSQL_HOST','localhost'),
    'port': int(os.environ.get('MYSQL_PORT','3306')),
    'user': os.environ.get('MYSQL_USER', 'root'),
    'password': os.environ.get('MYSQL_PASSWORD'),
    'database': os.environ.get('MYSQL_DATABASE','grocery_db'),
    'charset': 'utf8mb4',
    'autocommit': False
}

def get_db():
    """Get database connection"""
    if 'db' not in g:
        try:
            g.db = pymysql.connect(**MYSQL_CONFIG)
        except pymysql.Error as e:
            logger.error(f"Database connection error: {e}")
            raise
    return g.db

def init_db():
    """Initialize database and create tables"""
    try:
        logger.info("Connecting to database...")
        
        # First, connect without specifying database to create it if it doesn't exist
        config_without_db = MYSQL_CONFIG.copy()
        database_name = config_without_db.pop('database')
        
        db = pymysql.connect(**config_without_db)
        cursor = db.cursor()
        
        # Create database if it doesn't exist
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{database_name}`")
        cursor.execute(f"USE `{database_name}`")
        
        logger.info(f"Database '{database_name}' ready")
        
        # Create products table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS products (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(255) NOT NULL UNIQUE,
                unit ENUM('kg', 'litre', 'piece', 'grams', 'ml') NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                stock INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_name (name),
                INDEX idx_stock (stock),
                CONSTRAINT chk_price CHECK (price > 0),
                CONSTRAINT chk_stock CHECK (stock >= 0)
            ) ENGINE=InnoDB
        """)
        
        # Create orders table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id INT PRIMARY KEY AUTO_INCREMENT,
                order_number VARCHAR(20) NOT NULL UNIQUE,
                customer_name VARCHAR(255) NOT NULL,
                total DECIMAL(10,2) NOT NULL,
                order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status ENUM('pending', 'completed', 'cancelled') DEFAULT 'completed',
                INDEX idx_order_number (order_number),
                INDEX idx_customer (customer_name),
                INDEX idx_date (order_date),
                CONSTRAINT chk_total CHECK (total > 0)
            ) ENGINE=InnoDB
        """)
        
        # Create order_items table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS order_items (
                id INT PRIMARY KEY AUTO_INCREMENT,
                order_id INT NOT NULL,
                product_name VARCHAR(255) NOT NULL,
                quantity INT NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                INDEX idx_order_id (order_id),
                INDEX idx_product_name (product_name),
                CONSTRAINT chk_quantity CHECK (quantity > 0),
                CONSTRAINT chk_item_price CHECK (price > 0)
            ) ENGINE=InnoDB
        """)
        
        # Insert sample data if tables are empty
        cursor.execute("SELECT COUNT(*) FROM products")
        count_result = cursor.fetchone()
        if count_result and count_result[0] == 0:
            logger.info("Inserting sample products...")
            sample_products = [
                ('Rice', 'kg', 50.00, 100),
                ('Wheat Flour', 'kg', 40.00, 80),
                ('Sugar', 'kg', 45.00, 60),
                ('Cooking Oil', 'litre', 120.00, 30),
                ('Milk', 'litre', 55.00, 25),
                ('Bread', 'piece', 25.00, 50),
                ('Eggs', 'piece', 8.00, 200),
                ('Tomatoes', 'kg', 30.00, 40),
                ('Onions', 'kg', 25.00, 50),
                ('Potatoes', 'kg', 20.00, 70),
            ]
            
            cursor.executemany(
                "INSERT INTO products (name, unit, price, stock) VALUES (%s, %s, %s, %s)",
                sample_products
            )
        
        db.commit()
        logger.info("Database initialized successfully with all tables")
        
        # Verify tables
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()
        logger.info(f"Created tables: {[table[0] for table in tables]}")
        
        db.close()
        
    except pymysql.Error as err:
        logger.error(f"MySQL Error during initialization: {err}")
        raise
    except Exception as e:
        logger.error(f"General Error during initialization: {e}")
        raise

def close_db(error=None):
    """Close database connection"""
    db = g.pop('db', None)
    if db is not None:
        try:
            db.close()
            logger.debug("Database connection closed")
        except Exception as e:
            logger.error(f"Error closing database: {e}")

def execute_query(query, params=None, fetch_one=False, fetch_all=False):
    """Helper function to execute queries safely"""
    try:
        db = get_db()
        cursor = db.cursor(pymysql.cursors.DictCursor)
        cursor.execute(query, params or ())
        
        if fetch_all:
            result = cursor.fetchall()
        elif fetch_one:
            result = cursor.fetchone()
        else:
            result = cursor.lastrowid if 'INSERT' in query.upper() else cursor.rowcount
        
        if not any(word in query.upper() for word in ['SELECT', 'SHOW', 'DESC']):
            db.commit()
        
        return result
        
    except pymysql.Error as e:
        db = get_db()
        db.rollback()
        logger.error(f"Database query error: {e}")
        raise

def get_product_by_id(product_id):
    """Get product by ID"""
    return execute_query(
        "SELECT * FROM products WHERE id = %s",
        (product_id,),
        fetch_one=True
    )

def get_product_by_name(name):
    """Get product by name"""
    return execute_query(
        "SELECT * FROM products WHERE name = %s",
        (name,),
        fetch_one=True
    )

def update_product_stock(product_id, quantity_sold):
    """Update product stock after sale"""
    return execute_query(
        "UPDATE products SET stock = stock - %s WHERE id = %s AND stock >= %s",
        (quantity_sold, product_id, quantity_sold)
    )

def get_low_stock_products(threshold=10):
    """Get products with low stock"""
    return execute_query(
        "SELECT * FROM products WHERE stock <= %s ORDER BY stock ASC",
        (threshold,),
        fetch_all=True
    )

if __name__ == "__main__":
    # Test database initialization
    init_db()

    print("Database initialization test completed successfully!")

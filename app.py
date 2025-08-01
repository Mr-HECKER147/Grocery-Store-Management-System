from flask import Flask, render_template, request, jsonify
from werkzeug.exceptions import BadRequest
from db import get_db, close_db, init_db
import pymysql
import random
import re
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.secret_key = 'your-secret-key-change-this'
app.teardown_appcontext(close_db)

# Initialize database on startup (replaces deprecated @app.before_first_request)
try:
    init_db()
except Exception as e:
    logger.error(f"Error in setup/init_db(): {e}")

# Error handlers
@app.errorhandler(400)
def bad_request(error):
    return jsonify({'error': str(error.description)}), 400

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Resource not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal error: {error}")
    return jsonify({'error': 'Internal server error'}), 500

# Validation functions
def validate_product_data(data):
    """Validate product data"""
    if not data:
        raise BadRequest("No data provided")
    
    name = data.get('name', '').strip()
    if not name or len(name) < 2:
        raise BadRequest("Product name must be at least 2 characters")
    
    if not re.match(r'^[a-zA-Z0-9\s\-\_]+$', name):
        raise BadRequest("Product name contains invalid characters")
    
    unit = data.get('unit', '').strip()
    if unit not in ['kg', 'litre', 'piece', 'grams', 'ml']:
        raise BadRequest("Invalid unit. Must be kg, litre, piece, grams, or ml")
    
    try:
        price = float(data.get('price', 0))
        if price <= 0:
            raise BadRequest("Price must be positive")
    except (ValueError, TypeError):
        raise BadRequest("Invalid price format")
    
    try:
        stock = int(data.get('stock', 0))
        if stock < 0:
            raise BadRequest("Stock cannot be negative")
    except (ValueError, TypeError):
        raise BadRequest("Invalid stock format")
    
    return True

def validate_order_data(data):
    """Validate order data"""
    if not data:
        raise BadRequest("No data provided")
    
    customer_name = data.get('customer_name', '').strip()
    if not customer_name or len(customer_name) < 2:
        raise BadRequest("Customer name must be at least 2 characters")
    
    if not re.match(r'^[a-zA-Z\s]+$', customer_name):
        raise BadRequest("Customer name contains invalid characters")
    
    items = data.get('items', [])
    if not items or not isinstance(items, list):
        raise BadRequest("At least one item is required")
    
    for item in items:
        if not item.get('product_name'):
            raise BadRequest("Product name is required for all items")
        
        try:
            quantity = int(item.get('quantity', 0))
            if quantity <= 0:
                raise BadRequest("Quantity must be positive")
        except (ValueError, TypeError):
            raise BadRequest("Invalid quantity format")
    
    return True

def generate_order_number():
    """Generate unique order number"""
    return f"ORD{random.randint(10000, 99999)}"

# Routes
@app.route('/')
def dashboard():
    return render_template("index.html")

@app.route('/manage-products')
def manage_products():
    return render_template("manage-products.html")

@app.route('/api/orders')
def get_orders():
    """Get all orders with pagination"""
    try:
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 10))
        offset = (page - 1) * per_page
        
        db = get_db()
        cursor = db.cursor(pymysql.cursors.DictCursor)
        
        # Get orders with order items
        cursor.execute("""
            SELECT o.id, o.order_number, o.customer_name, o.total, o.order_date,
                   GROUP_CONCAT(CONCAT(oi.product_name, ' x ', oi.quantity) SEPARATOR ', ') as items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            GROUP BY o.id, o.order_number, o.customer_name, o.total, o.order_date
            ORDER BY o.order_date DESC
            LIMIT %s OFFSET %s
        """, (per_page, offset))
        
        orders = cursor.fetchall()
        
        # Get total count
        cursor.execute("SELECT COUNT(*) as total FROM orders")
        total_result = cursor.fetchone()
        total = total_result['total'] if total_result else 0
        
        return jsonify({
            'orders': orders,
            'total': total,
            'page': page,
            'per_page': per_page
        })
        
    except Exception as e:
        logger.error(f"Error fetching orders: {e}")
        return jsonify({'error': 'Failed to fetch orders'}), 500

@app.route('/api/orders', methods=['POST'])
def create_order():
    """Create new order with multiple items"""
    db = get_db()
    try:
        data = request.get_json()
        validate_order_data(data)
        
        customer_name = data['customer_name'].strip()
        items = data['items']
        
        cursor = db.cursor(pymysql.cursors.DictCursor)
        
        total = 0
        validated_items = []
        
        # Validate all items and calculate total
        for item in items:
            product_name = item['product_name'].strip()
            quantity = int(item['quantity'])
            
            # Get product details
            cursor.execute("SELECT id, price, stock FROM products WHERE name = %s", (product_name,))
            product = cursor.fetchone()
            
            if not product:
                raise BadRequest(f"Product '{product_name}' not found")
            
            if product['stock'] < quantity:
                raise BadRequest(f"Insufficient stock for '{product_name}'. Available: {product['stock']}, Requested: {quantity}")
            
            subtotal = product['price'] * quantity
            total += subtotal
            
            validated_items.append({
                'product_id': product['id'],
                'product_name': product_name,
                'quantity': quantity,
                'price': product['price'],
                'subtotal': subtotal
            })
        
        # Create order
        order_number = generate_order_number()
        
        # Ensure order number is unique
        cursor.execute("SELECT id FROM orders WHERE order_number = %s", (order_number,))
        while cursor.fetchone():
            order_number = generate_order_number()
            cursor.execute("SELECT id FROM orders WHERE order_number = %s", (order_number,))
        
        cursor.execute(
            "INSERT INTO orders (order_number, customer_name, total) VALUES (%s, %s, %s)",
            (order_number, customer_name, total)
        )
        order_id = cursor.lastrowid
        
        # Add order items and update stock
        for item in validated_items:
            cursor.execute(
                "INSERT INTO order_items (order_id, product_name, quantity, price) VALUES (%s, %s, %s, %s)",
                (order_id, item['product_name'], item['quantity'], item['price'])
            )
            
            cursor.execute(
                "UPDATE products SET stock = stock - %s WHERE id = %s",
                (item['quantity'], item['product_id'])
            )
        
        db.commit()
        logger.info(f"Order {order_number} created successfully")
        
        return jsonify({
            'message': 'Order created successfully',
            'order_number': order_number,
            'total': total
        }), 201
        
    except BadRequest as e:
        db.rollback()
        return jsonify({'error': str(e.description)}), 400
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating order: {e}")
        return jsonify({'error': 'Failed to create order'}), 500

@app.route('/api/manage-products', methods=['GET'])
def get_products():
    """Get all products"""
    try:
        db = get_db()
        cursor = db.cursor(pymysql.cursors.DictCursor)
        cursor.execute("SELECT * FROM products ORDER BY name")
        products = cursor.fetchall()
        return jsonify(products)
        
    except Exception as e:
        logger.error(f"Error fetching products: {e}")
        return jsonify({'error': 'Failed to fetch products'}), 500

@app.route('/api/manage-products', methods=['POST'])
def add_product():
    """Add new product"""
    try:
        data = request.get_json()
        validate_product_data(data)
        
        name = data['name'].strip()
        unit = data['unit'].strip()
        price = float(data['price'])
        stock = int(data.get('stock', 0))
        
        db = get_db()
        cursor = db.cursor()
        
        cursor.execute(
            "INSERT INTO products (name, unit, price, stock) VALUES (%s, %s, %s, %s)",
            (name, unit, price, stock)
        )
        db.commit()
        
        logger.info(f"Product '{name}' added successfully")
        return jsonify({'message': 'Product added successfully'}), 201
        
    except pymysql.IntegrityError as e:
        if 'Duplicate entry' in str(e):
            return jsonify({'error': 'Product with this name already exists'}), 400
        return jsonify({'error': 'Database constraint error'}), 400
    except BadRequest as e:
        return jsonify({'error': str(e.description)}), 400
    except Exception as e:
        logger.error(f"Error adding product: {e}")
        return jsonify({'error': 'Failed to add product'}), 500

@app.route('/api/manage-products/<int:product_id>', methods=['PUT'])
def update_product(product_id):
    """Update existing product"""
    try:
        data = request.get_json()
        validate_product_data(data)
        
        name = data['name'].strip()
        unit = data['unit'].strip()
        price = float(data['price'])
        stock = int(data.get('stock', 0))
        
        db = get_db()
        cursor = db.cursor()
        
        cursor.execute(
            "UPDATE products SET name = %s, unit = %s, price = %s, stock = %s WHERE id = %s",
            (name, unit, price, stock, product_id)
        )
        
        if cursor.rowcount == 0:
            return jsonify({'error': 'Product not found'}), 404
        
        db.commit()
        logger.info(f"Product ID {product_id} updated successfully")
        return jsonify({'message': 'Product updated successfully'})
        
    except BadRequest as e:
        return jsonify({'error': str(e.description)}), 400
    except Exception as e:
        logger.error(f"Error updating product: {e}")
        return jsonify({'error': 'Failed to update product'}), 500

@app.route('/api/manage-products/<int:product_id>', methods=['DELETE'])
def delete_product(product_id):
    """Delete product"""
    try:
        db = get_db()
        cursor = db.cursor()
        
        # Check if product exists
        cursor.execute("SELECT name FROM products WHERE id = %s", (product_id,))
        product = cursor.fetchone()
        
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        
        # Check if product is used in any orders
        cursor.execute("SELECT COUNT(*) as count FROM order_items WHERE product_name = %s", (product[0],))
        order_count_result = cursor.fetchone()
        order_count = order_count_result[0] if order_count_result else 0
        
        if order_count > 0:
            return jsonify({'error': 'Cannot delete product that has been ordered'}), 400
        
        cursor.execute("DELETE FROM products WHERE id = %s", (product_id,))
        db.commit()
        
        logger.info(f"Product ID {product_id} deleted successfully")
        return jsonify({'message': 'Product deleted successfully'})
        
    except Exception as e:
        logger.error(f"Error deleting product: {e}")
        return jsonify({'error': 'Failed to delete product'}), 500

@app.route('/api/stats')
def get_stats():
    """Get dashboard statistics"""
    try:
        db = get_db()
        cursor = db.cursor(pymysql.cursors.DictCursor)
        
        # Get order statistics
        cursor.execute("""
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(total), 0) as total_revenue,
                COUNT(CASE WHEN DATE(order_date) = CURDATE() THEN 1 END) as today_orders,
                COALESCE(SUM(CASE WHEN DATE(order_date) = CURDATE() THEN total ELSE 0 END), 0) as today_revenue
            FROM orders
        """)
        stats = cursor.fetchone()
        if not stats:
            stats = {'total_orders': 0, 'total_revenue': 0, 'today_orders': 0, 'today_revenue': 0}
        
        # Get product count
        cursor.execute("SELECT COUNT(*) as total_products FROM products")
        product_stats = cursor.fetchone()
        if not product_stats:
            product_stats = {'total_products': 0}
        
        # Get low stock products
        cursor.execute("SELECT COUNT(*) as low_stock_products FROM products WHERE stock <= 10")
        stock_stats = cursor.fetchone()
        if not stock_stats:
            stock_stats = {'low_stock_products': 0}
        
        return jsonify({
            'total_orders': stats['total_orders'],
            'total_revenue': float(stats['total_revenue']),
            'today_orders': stats['today_orders'],
            'today_revenue': float(stats['today_revenue']),
            'total_products': product_stats['total_products'],
            'low_stock_products': stock_stats['low_stock_products']
        })
        
    except Exception as e:
        logger.error(f"Error fetching stats: {e}")
        return jsonify({'error': 'Failed to fetch statistics'}), 500

if __name__ == "__main__":
    app.run(debug=True, use_reloader=False, port=5000)
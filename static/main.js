// Main Dashboard JavaScript for Grocery Store Management System

class GroceryStore {
  constructor() {
    this.allProducts = [];
    this.orderTotal = 0;
    this.currentOrderItems = [];
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadInitialData();
    this.addFirstProductRow();
  }

  // Event Bindings
  bindEvents() {
    // Form submission
    $("#orderForm").on("submit", (e) => this.handleOrderSubmit(e));

    // Add product button
    $("#addProduct").on("click", () => this.addProductRow());

    // Remove product row
    $(document).on("click", ".removeProduct", (e) => this.removeProductRow(e));

    // Product selection change
    $(document).on("change", ".product-select", (e) =>
      this.handleProductChange(e)
    );

    // Quantity change
    $(document).on("input", ".quantity-input", (e) =>
      this.handleQuantityChange(e)
    );

    // Refresh button - Fixed to work with onclick attribute
    window.refreshData = () => this.refreshData();
  }

  // Load initial data
  async loadInitialData() {
    try {
      await Promise.all([
        this.fetchProducts(),
        this.fetchOrders(),
        this.fetchStats(),
      ]);
    } catch (error) {
      this.showToast("Failed to load initial data", "error");
      console.error("Init error:", error);
    }
  }

  // API Calls
  async fetchProducts() {
    try {
      const response = await fetch("/api/manage-products");
      if (!response.ok) throw new Error("Failed to fetch products");

      this.allProducts = await response.json();
      this.updateProductSelects();
      return this.allProducts;
    } catch (error) {
      console.error("Error fetching products:", error);
      this.showToast("Failed to load products", "error");
      return [];
    }
  }

  async fetchOrders() {
    try {
      const response = await fetch("/api/orders?per_page=10");
      if (!response.ok) throw new Error("Failed to fetch orders");

      const data = await response.json();
      this.displayOrders(data.orders || []);
      return data;
    } catch (error) {
      console.error("Error fetching orders:", error);
      this.showToast("Failed to load orders", "error");
      this.displayOrders([]);
    }
  }

  async fetchStats() {
    try {
      const response = await fetch("/api/stats");
      if (!response.ok) throw new Error("Failed to fetch stats");

      const stats = await response.json();
      this.displayStats(stats);
      return stats;
    } catch (error) {
      console.error("Error fetching stats:", error);
      // Show default stats on error
      this.displayStats({
        total_orders: 0,
        total_revenue: 0,
        today_orders: 0,
        today_revenue: 0,
        total_products: 0,
        low_stock_products: 0,
      });
    }
  }

  async submitOrder(orderData) {
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to create order");
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  // UI Updates
  displayStats(stats) {
    $("#totalOrders").text(stats.total_orders || 0);
    $("#totalRevenue").text(this.formatCurrency(stats.total_revenue || 0));
    $("#todayOrders").text(stats.today_orders || 0);
    $("#todayRevenue").text(this.formatCurrency(stats.today_revenue || 0));
    $("#lowStockProducts").text(stats.low_stock_products || 0);
  }

  displayOrders(orders) {
    const tbody = $("#ordersTableBody");

    if (!orders || orders.length === 0) {
      tbody.html(`
                <tr>
                    <td colspan="5" class="text-center text-muted">
                        <i class="fas fa-inbox"></i> No orders found
                    </td>
                </tr>
            `);
      return;
    }

    let html = "";
    orders.forEach((order) => {
      const date = new Date(order.order_date).toLocaleString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const items = order.items || "N/A";
      const total = this.formatCurrency(order.total);

      html += `
                <tr>
                    <td>${date}</td>
                    <td><strong>${order.order_number}</strong></td>
                    <td>${this.escapeHtml(order.customer_name)}</td>
                    <td><small>${this.escapeHtml(items)}</small></td>
                    <td><strong>${total}</strong></td>
                </tr>
            `;
    });

    tbody.html(html);
  }

  // Product Row Management
  addFirstProductRow() {
    if ($(".product-row").length === 0) {
      this.addProductRow();
    }
  }

  addProductRow() {
    if (this.allProducts.length === 0) {
      this.showToast(
        "No products available. Please add products first.",
        "error"
      );
      return;
    }

    const rowIndex = $(".product-row").length;
    const options = this.generateProductOptions();

    const html = `
            <div class="product-row panel panel-default mb-2" data-index="${rowIndex}">
                <div class="panel-body">
                    <div class="row">
                        <div class="col-md-5">
                            <select class="form-control product-select" required>
                                ${options}
                            </select>
                        </div>
                        <div class="col-md-3">
                            <input type="number" class="form-control quantity-input" 
                                   placeholder="Quantity" min="1" required>
                        </div>
                        <div class="col-md-2">
                            <div class="product-subtotal">₹0.00</div>
                        </div>
                        <div class="col-md-2">
                            <button type="button" class="btn btn-danger btn-sm removeProduct">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

    $("#productList").append(html);
    this.updateOrderTotal();
  }

  removeProductRow(e) {
    const $row = $(e.target).closest(".product-row");
    $row.fadeOut(300, () => {
      $row.remove();
      this.updateOrderTotal();

      // Ensure at least one product row exists
      if ($(".product-row").length === 0) {
        this.addProductRow();
      }
    });
  }

  generateProductOptions() {
    let options = '<option value="">-- Select Product --</option>';

    this.allProducts.forEach((product) => {
      const stockInfo =
        product.stock > 0 ? `(Stock: ${product.stock})` : "(Out of Stock)";
      const disabled = product.stock <= 0 ? "disabled" : "";
      const price = this.formatCurrency(product.price);

      options += `
                <option value="${product.name}" 
                        data-price="${product.price}" 
                        data-stock="${product.stock}" 
                        data-unit="${product.unit}"
                        ${disabled}>
                    ${this.escapeHtml(product.name)} - ${price}/${
        product.unit
      } ${stockInfo}
                </option>
            `;
    });

    return options;
  }

  updateProductSelects() {
    const options = this.generateProductOptions();
    $(".product-select").each(function () {
      const currentValue = $(this).val();
      $(this).html(options);
      $(this).val(currentValue);
    });
  }

  // Event Handlers
  handleProductChange(e) {
    const $select = $(e.target);
    const $row = $select.closest(".product-row");
    const $quantityInput = $row.find(".quantity-input");
    const selectedOption = $select.find("option:selected");

    if (selectedOption.val()) {
      const maxStock = parseInt(selectedOption.data("stock"));
      $quantityInput.attr("max", maxStock);
      $quantityInput.prop("disabled", false);

      if (maxStock === 0) {
        $quantityInput.val("").prop("disabled", true);
        this.showToast("Selected product is out of stock", "error");
      }
    } else {
      $quantityInput.val("").prop("disabled", true).removeAttr("max");
    }

    this.calculateRowSubtotal($row);
  }

  handleQuantityChange(e) {
    const $input = $(e.target);
    const $row = $input.closest(".product-row");
    const maxStock = parseInt($input.attr("max"));
    const quantity = parseInt($input.val());

    if (quantity > maxStock) {
      $input.val(maxStock);
      this.showToast(`Maximum available quantity is ${maxStock}`, "info");
    }

    this.calculateRowSubtotal($row);
  }

  calculateRowSubtotal($row) {
    const $select = $row.find(".product-select");
    const $quantityInput = $row.find(".quantity-input");
    const $subtotalDiv = $row.find(".product-subtotal");

    const selectedOption = $select.find("option:selected");
    const price = parseFloat(selectedOption.data("price")) || 0;
    const quantity = parseInt($quantityInput.val()) || 0;
    const subtotal = price * quantity;

    $subtotalDiv.text(this.formatCurrency(subtotal));
    this.updateOrderTotal();
  }

  updateOrderTotal() {
    let total = 0;
    $(".product-row").each(function () {
      const subtotalText = $(this).find(".product-subtotal").text();
      const subtotal = parseFloat(subtotalText.replace(/[₹,]/g, "")) || 0;
      total += subtotal;
    });

    this.orderTotal = total;
  }

  async handleOrderSubmit(e) {
    e.preventDefault();

    const customerName = $("#customer_name").val().trim();
    if (!customerName) {
      this.showToast("Please enter customer name", "error");
      return;
    }

    // Collect order items
    const items = [];
    let hasValidItems = false;

    $(".product-row").each(function () {
      const $row = $(this);
      const productName = $row.find(".product-select").val();
      const quantity = parseInt($row.find(".quantity-input").val());

      if (productName && quantity > 0) {
        items.push({
          product_name: productName,
          quantity: quantity,
        });
        hasValidItems = true;
      }
    });

    if (!hasValidItems) {
      this.showToast("Please add at least one product to the order", "error");
      return;
    }

    // Show loading
    this.showLoadingModal(true);

    try {
      const orderData = {
        customer_name: customerName,
        items: items,
      };

      const result = await this.submitOrder(orderData);

      this.showToast(
        `Order ${result.order_number} placed successfully!`,
        "success"
      );
      this.resetOrderForm();
      await this.refreshData();
    } catch (error) {
      this.showToast(error.message, "error");
    } finally {
      this.showLoadingModal(false);
    }
  }

  // Utility Functions
  resetOrderForm() {
    $("#orderForm")[0].reset();
    $("#productList").empty();
    this.addFirstProductRow();
    this.orderTotal = 0;
  }

  async refreshData() {
    try {
      this.showToast("Refreshing data...", "info");
      await this.loadInitialData();
      this.showToast("Data refreshed successfully", "success");
    } catch (error) {
      this.showToast("Failed to refresh data", "error");
    }
  }

  showLoadingModal(show) {
    if (show) {
      $("#loadingModal").modal("show");
    } else {
      $("#loadingModal").modal("hide");
    }
  }

  showToast(message, type = "success") {
    const $toast = $("#toast");
    $toast
      .removeClass("toast-success toast-error toast-info")
      .addClass(`toast-${type}`)
      .text(message)
      .fadeIn();

    setTimeout(() => {
      $toast.fadeOut();
    }, 4000);
  }

  formatCurrency(amount) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    })
      .format(amount)
      .replace("₹", "₹");
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize the application when DOM is ready
$(document).ready(function () {
  window.groceryStore = new GroceryStore();
});

// Global function for refresh button (backwards compatibility)
function refreshData() {
  if (window.groceryStore) {
    window.groceryStore.refreshData();
  }
}

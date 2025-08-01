// Enhanced Manage Products JavaScript

class ProductManager {
  constructor() {
    this.products = [];
    this.currentProduct = null;
    this.isEditMode = false;
    this.init();
  }

  init() {
    this.bindEvents();
    this.fetchProducts();
  }

  bindEvents() {
    // Save product button
    $("#saveProduct").on("click", () => this.handleSaveProduct());

    // Form submission
    $("#productForm").on("submit", (e) => {
      e.preventDefault();
      this.handleSaveProduct();
    });

    // Modal events
    $("#productModal").on("show.bs.modal", () => this.onModalShow());
    $("#productModal").on("hidden.bs.modal", () => this.onModalHidden());

    // Add product button
    $('[data-target="#productModal"]').on("click", () => {
      this.isEditMode = false;
      this.currentProduct = null;
    });

    // Input validation
    $("#price").on("input", this.validatePriceInput);
    $("#stock").on("input", this.validateStockInput);
    $("#name").on("input", this.validateNameInput);

    // Enter key submission
    $("#productModal input").on("keypress", (e) => {
      if (e.which === 13) {
        this.handleSaveProduct();
      }
    });

    // Confirm delete modal
    $("#confirmDelete").on("click", () => this.handleConfirmDelete());
  }

  // Event Handlers
  onModalShow() {
    if (!this.isEditMode) {
      this.resetForm();
      $(".modal-title").html('<i class="fas fa-plus"></i> Add New Product');
      $("#saveProduct").html('<i class="fas fa-save"></i> Add Product');
    } else {
      $(".modal-title").html('<i class="fas fa-edit"></i> Edit Product');
      $("#saveProduct").html('<i class="fas fa-save"></i> Update Product');
      this.populateForm(this.currentProduct);
    }
    setTimeout(() => $("#name").focus(), 300);
  }

  onModalHidden() {
    this.resetForm();
    this.currentProduct = null;
    this.isEditMode = false;
  }

  async handleSaveProduct() {
    if (!this.validateForm()) {
      return;
    }

    const productData = this.getFormData();

    try {
      this.showLoading(true);

      if (this.isEditMode) {
        await this.updateProduct(this.currentProduct.id, productData);
        this.showToast("Product updated successfully!", "success");
      } else {
        await this.addProduct(productData);
        this.showToast("Product added successfully!", "success");
      }

      $("#productModal").modal("hide");
      await this.fetchProducts();
    } catch (error) {
      this.showToast(error.message, "error");
    } finally {
      this.showLoading(false);
    }
  }

  handleConfirmDelete() {
    if (this.productToDelete) {
      this.deleteProductById(this.productToDelete);
      $("#confirmModal").modal("hide");
      this.productToDelete = null;
    }
  }

  // API Calls
  async fetchProducts() {
    try {
      this.showTableLoading(true);
      const response = await fetch("/api/manage-products");

      if (!response.ok) {
        throw new Error("Failed to fetch products");
      }

      this.products = await response.json();
      this.displayProducts();
    } catch (error) {
      console.error("Error fetching products:", error);
      this.showToast("Failed to load products", "error");
      this.displayProducts([]);
    } finally {
      this.showTableLoading(false);
    }
  }

  async addProduct(productData) {
    const response = await fetch("/api/manage-products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(productData),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Failed to add product");
    }

    return result;
  }

  async updateProduct(productId, productData) {
    const response = await fetch(`/api/manage-products/${productId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(productData),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Failed to update product");
    }

    return result;
  }

  async deleteProduct(productId) {
    const response = await fetch(`/api/manage-products/${productId}`, {
      method: "DELETE",
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Failed to delete product");
    }

    return result;
  }

  // UI Methods
  displayProducts() {
    const tbody = $("table tbody");

    if (!this.products || this.products.length === 0) {
      tbody.html(`
                <tr>
                    <td colspan="5" class="text-center text-muted">
                        <i class="fas fa-box-open"></i><br>
                        No products found. Add your first product!
                    </td>
                </tr>
            `);
      return;
    }

    let html = "";
    this.products.forEach((product) => {
      const stockClass =
        product.stock <= 10
          ? "text-danger"
          : product.stock <= 20
          ? "text-warning"
          : "text-success";

      const stockIcon =
        product.stock <= 10
          ? "fas fa-exclamation-triangle"
          : product.stock <= 20
          ? "fas fa-exclamation-circle"
          : "fas fa-check-circle";

      html += `
                <tr data-product-id="${product.id}">
                    <td>
                        <strong>${this.escapeHtml(product.name)}</strong>
                    </td>
                    <td>
                        <span class="label label-default">${product.unit}</span>
                    </td>
                    <td>
                        <strong>${this.formatCurrency(product.price)}</strong>
                    </td>
                    <td class="${stockClass}">
                        <i class="${stockIcon}"></i>
                        ${product.stock} units
                    </td>
                    <td>
                        <div class="btn-group" role="group">
                            <button class="btn btn-sm btn-info" onclick="productManager.editProduct(${
                              product.id
                            })" 
                                    title="Edit Product">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="productManager.confirmDeleteProduct(${
                              product.id
                            })" 
                                    title="Delete Product">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
    });

    tbody.html(html);
  }

  showTableLoading(show) {
    const tbody = $("table tbody");
    if (show) {
      tbody.html(`
                <tr>
                    <td colspan="5" class="text-center">
                        <i class="fas fa-spinner fa-spin"></i> Loading products...
                    </td>
                </tr>
            `);
    }
  }

  // Form Methods
  getFormData() {
    return {
      name: $("#name").val().trim(),
      unit: $("#uoms").val(), // Fixed: using correct field name
      price: parseFloat($("#price").val()),
      stock: parseInt($("#stock").val()) || 0,
    };
  }

  populateForm(product) {
    $("#productId").val(product.id);
    $("#name").val(product.name);
    $("#uoms").val(product.unit);
    $("#price").val(product.price);
    $("#stock").val(product.stock || 0);
  }

  resetForm() {
    $("#productForm")[0].reset();
    $("#productId").val("0");
    $(".form-group").removeClass("has-error");
    $(".help-block").remove();
  }

  validateForm() {
    let isValid = true;
    $(".form-group").removeClass("has-error");
    $(".help-block").remove();

    // Validate name
    const name = $("#name").val().trim();
    if (!name || name.length < 2) {
      this.showFieldError(
        "#name",
        "Product name must be at least 2 characters long"
      );
      isValid = false;
    } else if (!/^[a-zA-Z0-9\s\-\_]+$/.test(name)) {
      this.showFieldError("#name", "Product name contains invalid characters");
      isValid = false;
    }

    // Validate unit
    const unit = $("#uoms").val();
    if (!unit) {
      this.showFieldError("#uoms", "Please select a unit");
      isValid = false;
    }

    // Validate price
    const price = parseFloat($("#price").val());
    if (!price || price <= 0) {
      this.showFieldError("#price", "Price must be greater than 0");
      isValid = false;
    }

    // Validate stock
    const stock = parseInt($("#stock").val());
    if (isNaN(stock) || stock < 0) {
      this.showFieldError("#stock", "Stock must be 0 or greater");
      isValid = false;
    }

    return isValid;
  }

  showFieldError(fieldSelector, message) {
    const $field = $(fieldSelector);
    const $formGroup = $field.closest(".form-group");

    $formGroup.addClass("has-error");
    $formGroup.append(`<span class="help-block text-danger">${message}</span>`);
  }

  // Input Validators
  validatePriceInput(e) {
    const value = e.target.value;
    const regex = /^\d*\.?\d{0,2}$/;

    if (!regex.test(value)) {
      e.target.value = value.slice(0, -1);
    }
  }

  validateStockInput(e) {
    const value = e.target.value;
    if (!/^\d*$/.test(value)) {
      e.target.value = value.replace(/[^\d]/g, "");
    }
  }

  validateNameInput(e) {
    const value = e.target.value;
    const regex = /^[a-zA-Z0-9\s\-\_]*$/;

    if (!regex.test(value)) {
      e.target.value = value.slice(0, -1);
    }
  }

  // Product Actions
  editProduct(productId) {
    const product = this.products.find((p) => p.id === productId);
    if (!product) {
      this.showToast("Product not found", "error");
      return;
    }

    this.isEditMode = true;
    this.currentProduct = product;
    $("#productModal").modal("show");
  }

  confirmDeleteProduct(productId) {
    const product = this.products.find((p) => p.id === productId);
    if (!product) {
      this.showToast("Product not found", "error");
      return;
    }

    this.productToDelete = productId;

    // Update modal content
    $("#confirmModal .modal-body p")
      .first()
      .text(`Are you sure you want to delete "${product.name}"?`);
    $("#confirmModal").modal("show");
  }

  async deleteProductById(productId) {
    try {
      this.showRowLoading(productId, true);
      await this.deleteProduct(productId);
      this.showToast("Product deleted successfully!", "success");
      await this.fetchProducts();
    } catch (error) {
      this.showToast(error.message, "error");
      this.showRowLoading(productId, false);
    }
  }

  showRowLoading(productId, show) {
    const $row = $(`tr[data-product-id="${productId}"]`);
    const $actions = $row.find(".btn-group");

    if (show) {
      $actions.html('<i class="fas fa-spinner fa-spin"></i>');
    }
  }

  // Utility Methods
  showLoading(show) {
    const $saveBtn = $("#saveProduct");
    if (show) {
      $saveBtn
        .prop("disabled", true)
        .html('<i class="fas fa-spinner fa-spin"></i> Saving...');
    } else {
      $saveBtn
        .prop("disabled", false)
        .html(
          this.isEditMode
            ? '<i class="fas fa-save"></i> Update Product'
            : '<i class="fas fa-save"></i> Add Product'
        );
    }
  }

  showToast(message, type = "success") {
    // Create toast if it doesn't exist
    if ($("#toast").length === 0) {
      $("body").append('<div id="toast" class="toast"></div>');
    }

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

  // Public methods for backward compatibility
  saveProduct() {
    this.handleSaveProduct();
  }
}

// Initialize when DOM is ready
$(document).ready(function () {
  window.productManager = new ProductManager();
});

// Global functions for backward compatibility
function deleteProduct(id) {
  if (window.productManager) {
    window.productManager.confirmDeleteProduct(id);
  }
}

function editProduct(id) {
  if (window.productManager) {
    window.productManager.editProduct(id);
  }
}

    root.querySelectorAll('[data-matrix-item]').forEach(button => button.onclick = async () => {
      const version = editable();
      if (!version || ui.saving || !canEditDraft()) return;
      // An unresolved operation must be checked before changing local intent.
      if(transport().hasUnknown()){ui.lastError='UNKNOWN_OPERATION_CHECK_REQUIRED';render();return;}
      const item = version.snapshot.items.find(row => row.id === button.dataset.matrixItem);
      if (!item || item.isDeleted) return;
      const code = button.dataset.matrixProduct;
      const product = catalog().products.find(row => row.code === code);
      if (!product) return;
      const codes = new Set(item.productCodes || []);
      const included = !codes.has(code);
      if (included) codes.add(code); else codes.delete(code);
      item.productCodes = [...codes];
      item.productRefs = item.productCodes.map(value => {
        const row = catalog().products.find(entry => entry.code === value);
        return { code:value, kind:row?.kind || 'unresolved', name:row?.name || '', specification:row?.specification || '' };
      });
      if (item.products) item.products = clone(item.productRefs);
      record(version, 'item-products-updated', `${item.checkNo} · ${code} · ${included ? '加入' : '移除'}`);
      button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='…';
      try { await persist(isVi() ? 'Đã lưu liên kết sản phẩm' : '產品關聯已儲存'); }
      catch (error) { toast(displayDraftError(error)); }
    });

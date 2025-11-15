var BrightfinSapBuilderAAA = Class.create();
BrightfinSapBuilderAAA.prototype = Object.extendsObject(
  x_mobi_p.MobiChordSapBuilderDefault,
  {
    initialize: function () {
      this.recordClassName = "x_mobi_aaa_cust_account_payable_record";
      this.sourceTable = "x_mobi_p_allocation_result";
      this.cache = {};
      this.internalCode = 1;
      this.domain = "";
      this.credit = 0;

      this.rowCacheAttributes = [
        "co",
        "acct",
        "cctr",
        "st",
        "fac",
        "prod",
        "ic",
        "futr",
        "debit_dec",
        "credit_dec",
        "line_description",
      ];
    },

    addHeaderRecord: function (domain, report_sysId, internal_code) { },

    _formatDate: function (dateStr) {
      var gd = new GlideDate();
      gd.setValue(dateStr);
      return gd.getByFormat("MMddyyyy");
    },

    _getSource: function (ctx) {
      var grSource = new GlideRecord(this.sourceTable);
      grSource.addQuery("invoice", "IN", ctx.invoiceIds);
      grSource.orderBy("gl_account");
      grSource.orderBy("cost_center.code");
      grSource.orderBy("billing_account.global_account");
      grSource.orderBy("invoice");
      grSource.query();
      return grSource;
    },

    _getGlAmount: function (gl, invoiceIds) {
      var amount = 0;
      var grRes = new GlideAggregate(this.sourceTable);
      grRes.addQuery("gl_account", gl);
      grRes.addQuery("invoice", "IN", invoiceIds);
      grRes.setGroup(false);
      grRes.addAggregate("SUM", "allocation_amount");
      grRes.query();
      if (grRes.next()) {
        amount = grRes.getAggregate("SUM", "allocation_amount") || 0;
      }
      this.credit += parseFloat(amount);
      return Math.abs(amount).toFixed(2) || 0;
    },


    _createGLSummaryRecord: function (gl, invoiceIds) {
      if (gl) {
        gl = gl.toUpperCase();
      }
      var date = new GlideDate();
      var rowCache = {};
      var rowValues = [
        "500",
        "56110",
        "03136",
        "05",
        "1000",
        "0000",
        "000",
        "0000",
        "",
        this._getGlAmount(gl, invoiceIds),
        gl + " " + date.getByFormat("MMddyyyy"),
      ];
      for (var i = 0, len = this.rowCacheAttributes.length; i < len; i++) {
        rowCache[this.rowCacheAttributes[i]] = rowValues[i];
      }
      rowCache.sys_domain = this.domain;
      return rowCache;
    },

    _createSummaryRecord: function (ctx, total) {
      var invoice = ctx.invoiceIds.split(",")[0].toString();
      var grReportRecord = new GlideRecord(this.recordClassName);
      grReportRecord.initialize();
      grReportRecord.invoice = invoice;
      grReportRecord.account_payable_report = ctx.report.sysId;
      grReportRecord.debit_dec = Math.abs(total).toFixed(2);
      grReportRecord.credit_dec = Math.abs(this.credit).toFixed(2);
      grReportRecord.internal_code = ("00000000" + this.internalCode++).slice(
        -8
      );
      grReportRecord.sys_domain = this.domain;
      grReportRecord.insert();
    },

    _generateCacheFromSource: function (source) {
      var rowCache = {};
      var invoice = source.invoice;
      var costCenter = source.cost_center.code.toString().split("_");
      var provMapping = invoice.contract.provider_mapping.name
        .toString()
        .toUpperCase();
      var globalAccount = source.billing_account.global_account.account_number
        .toString()
        .toUpperCase();
      var date = this._formatDate(invoice.date.toString());
      var lineDescription = provMapping + "_" + globalAccount + "_" + date;
      var rowValues = [
        "500",
        source.gl_account.toString(),
        costCenter[0].toString(),
        costCenter[1] ? costCenter[1].toString() : "",
        costCenter[2] ? costCenter[2].toString() : "",
        "0000",
        "000",
        "0000",
        0,
        0,
        lineDescription,
      ];
      for (var i = 0, len = this.rowCacheAttributes.length; i < len; i++) {
        rowCache[this.rowCacheAttributes[i]] = rowValues[i];
      }
      if (!this.domain) {
        this.domain = invoice.sys_domain.toString();
      }
      rowCache.sys_domain = invoice.sys_domain.toString();
      return rowCache;
    },

    _generateCache: function (ctx, source) {
      var cache = {};
      var gl_account = "Empty";
      var costCenterId = "Empty";
      var invoiceId = "Empty";
      var fan = "Empty";
      var provider = "Empty";
      var key = "";

      while (source.next()) {
        if (gl_account != source.gl_account.toString()) {
          if (key) {
            cache[key + "_sum"] = this._createGLSummaryRecord(
              gl_account,
              ctx.invoiceIds
            );
          }
          gl_account = source.gl_account.toString();
          costCenterId = "Empty";
          invoiceId = "Empty";
          provider = "Empty";
          fan = "Empty";
        }

        if (
          costCenterId != source.cost_center.toString() ||
          invoiceId != source.invoice.toString() ||
          fan != source.billing_account.global_account.toString() ||
          provider != source.invoice.contract.provider_mapping.toString()
        ) {
          invoiceId = source.invoice.toString();
          provider = source.invoice.contract.provider_mapping.toString();
          costCenterId = source.cost_center.toString();
          fan = source.billing_account.global_account.toString();
          if (cache[key]) {
            cache[key].debit_dec = cache[key].debit_dec
              ? cache[key].debit_dec
              : 0;
            cache[key].credit_dec = cache[key].credit_dec
              ? cache[key].credit_dec
              : 0;
          }
        }
        key =
          source.gl_account.toString() +
          "_" +
          source.cost_center.toString() +
          "_" +
          source.billing_account.global_account.toString() +
          "_" +
          source.invoice.toString() +
          "_" +
          source.invoice.contract.provider_mapping.toString();
        if (!cache[key]) {
          cache[key] = this._generateCacheFromSource(source);
        }
        cache[key].debit_dec +=
          parseFloat(source.allocation_amount.toString()) || 0;
      }

      if (cache[key]) {
        cache[key].debit_dec = cache[key].debit_dec ? cache[key].debit_dec : 0;
        cache[key].credit_dec = cache[key].credit_dec
          ? cache[key].credit_dec
          : 0;
      }
      cache[key + "_sum"] = this._createGLSummaryRecord(
        gl_account == "Empty" ? "" : gl_account,
        ctx.invoiceIds
      );
      this.cache = cache;
    },

    _createRecordFromCache: function (ctx, key) {
      var invoice = ctx.invoiceIds.split(",")[0].toString();
      var rowCache = this.cache[key];
      if (gs.nil(rowCache)) {
        return;
      }
      var amount = Number(rowCache.debit_dec);
      if (amount < 0) {
        rowCache.debit_dec = 0;
        rowCache.credit_dec = Number(amount.toString().replace("-", ""));
      }
      var grReportRecord = new GlideRecord(this.recordClassName);
      grReportRecord.initialize();
      grReportRecord.invoice = invoice;
      grReportRecord.account_payable_report = ctx.report.sysId;
      for (var i = 0, len = this.rowCacheAttributes.length; i < len; i++) {
        grReportRecord[this.rowCacheAttributes[i]] =
          rowCache[this.rowCacheAttributes[i]];
      }
      grReportRecord.internal_code = ("00000000" + this.internalCode++).slice(
        -8
      );
      grReportRecord.sys_domain = rowCache.sys_domain;
      grReportRecord.insert();
      return amount * 1;
    },

    createRecords: function (ctx) {
      var source = this._getSource(ctx);
      var total = 0;
      this._generateCache(ctx, source);
      for (var key in this.cache) {
        total += this._createRecordFromCache(ctx, key);
      }
      this._createSummaryRecord(ctx, total);
      return Math.round(total * 100) / 100;
    },
    type: "BrightfinSapBuilderAAA",
  }
);

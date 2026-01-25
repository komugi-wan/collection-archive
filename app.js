/**
 * COLLECTION ARCHIVE v1.0
 * 保守性を高めるため、ロジック・表示・データを整理
 */

// =========================================
// 1. IndexedDB Manager (データ永続化)
// =========================================
const IDB = {
    dbName: "CollectionArchiveDB",
    storeName: "appData",
    db: null,

    /** DBの初期化 */
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },

    /** 値の保存 */
    async set(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], "readwrite");
            const store = transaction.objectStore(this.storeName);
            const request = store.put(value, key);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    },

    /** 値の取得 */
    async get(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], "readonly");
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }
};

// =========================================
// 2. State & Constants (状態管理)
// =========================================
const CONFIG = {
    KEYS: {
        DB: 'gap_db', ORDER: 'gap_order', SETS: 'gap_char_sets', 
        TEMPLATES: 'gap_temps', PRESETS: 'gap_presets', 
        TRADE: 'gap_trade_config', SORT: 'gap_sort_mode', LAST_ITEM: 'gap_last_item'
    },
    DEFAULT_CHARS: ["北門", "是国", "金城", "阿修", "愛染", "増長", "音済", "王茶利", "野目", "釈村", "唯月", "遙日", "不動", "殿"],
    DEFAULT_TEMPLATES: ["缶バッジ", "アクスタ", "ブロマイド"],
};

const Store = {
    db: {}, // 全データ
    order: [], // シリーズの並び順
    charSets: {}, // キャラクターセット定義
    templates: [], // 新規登録時のテンプレート
    presets: [], // 編集時のショートカット
    tradeConfig: { prefix: "", suffix: "", showInf: true },
    sortMode: 'new',
    lastItem: null,
    
    // 一時的な状態
    currentSeriesId: null,
    currentItemIdx: null,
    activeCharList: [],
    tempStocks: {},
    editorFromMissing: false,

    /** ストレージからデータを読み込む */
    async load() {
        await IDB.init();
        this.db = await IDB.get(CONFIG.KEYS.DB) || {};
        this.order = await IDB.get(CONFIG.KEYS.ORDER) || [];
        this.charSets = await IDB.get(CONFIG.KEYS.SETS) || { "デフォルト": CONFIG.DEFAULT_CHARS };
        this.templates = await IDB.get(CONFIG.KEYS.TEMPLATES) || CONFIG.DEFAULT_TEMPLATES;
        this.presets = await IDB.get(CONFIG.KEYS.PRESETS) || [];
        this.tradeConfig = await IDB.get(CONFIG.KEYS.TRADE) || { prefix: "", suffix: "", showInf: true };
        this.sortMode = await IDB.get(CONFIG.KEYS.SORT) || 'new';
        this.lastItem = await IDB.get(CONFIG.KEYS.LAST_ITEM) || null;
    },

    /** データを永続化する */
    async save() {
        await IDB.set(CONFIG.KEYS.DB, this.db);
        await IDB.set(CONFIG.KEYS.ORDER, this.order);
        await IDB.set(CONFIG.KEYS.SETS, this.charSets);
        await IDB.set(CONFIG.KEYS.TRADE, this.tradeConfig);
        await IDB.set(CONFIG.KEYS.SORT, this.sortMode);
        await IDB.set(CONFIG.KEYS.PRESETS, this.presets);
    }
};

// =========================================
// 3. Application Controller (全体制御)
// =========================================
const App = {
    /** 初期起動 */
    async init() {
        await Store.load();
        this.bindEvents();
        Render.seriesList();
        
        // スプラッシュ画面を消す
        setTimeout(() => {
            const splash = document.getElementById('splash-screen');
            splash.style.opacity = '0';
            setTimeout(() => splash.style.display = 'none', 500);
        }, 800);
    },

    /** イベントリスナーの登録（インラインonclickの代わり） */
    bindEvents() {
        // メインタブ
        document.getElementById('tab-list').addEventListener('click', () => this.switchMainTab('list'));
        document.getElementById('tab-missing').addEventListener('click', () => this.switchMainTab('missing'));
        
        // 検索・フィルタ
        document.getElementById('searchBar').addEventListener('input', () => Render.seriesList());
        document.getElementById('btnToggleDate').addEventListener('click', () => this.toggleDateFilter());
        document.getElementById('filterStart').addEventListener('change', () => Render.seriesList());
        document.getElementById('filterEnd').addEventListener('change', () => Render.seriesList());
        document.getElementById('btnClearDate').addEventListener('click', () => this.clearDateFilter());

        // ソート
        document.getElementById('sort-new').addEventListener('click', () => this.setSortMode('new'));
        document.getElementById('sort-date').addEventListener('click', () => this.setSortMode('date'));
        document.getElementById('sort-custom').addEventListener('click', () => this.setSortMode('custom'));

        // ヘッダー・FAB
        document.getElementById('btn-open-settings').addEventListener('click', () => this.toggleSettings(true));
        document.getElementById('mainFab').addEventListener('click', () => this.openSeriesModal());
        
        // モーダル・ビュー操作
        document.getElementById('btn-close-detail').addEventListener('click', () => this.closeDetail());
        document.getElementById('btn-add-item').addEventListener('click', () => this.openItemEditor());
        document.getElementById('editorBackBtn').addEventListener('click', () => this.closeEditor());
        document.getElementById('btn-save-item').addEventListener('click', () => Actions.saveItem());
        document.getElementById('btn-confirm-series').addEventListener('click', () => Actions.saveSeriesModal());
        document.getElementById('btn-close-series-modal').addEventListener('click', () => this.closeSeriesModal());
        document.getElementById('btn-close-unboxing').addEventListener('click', () => this.closeUnboxing());
        document.getElementById('btn-delete-all-items').addEventListener('click', () => Actions.deleteAllItems());
        
        // 編集機能
        document.getElementById('btn-apply-history').addEventListener('click', () => this.applyHistory());
        document.getElementById('btn-bulk-select').addEventListener('click', () => Actions.bulkToggleTargets(true));
        document.getElementById('btn-bulk-cancel').addEventListener('click', () => Actions.bulkToggleTargets(false));
        document.getElementById('btn-bulk-inc').addEventListener('click', () => Actions.bulkIncrementOwn());
        document.getElementById('btn-bulk-reset').addEventListener('click', () => Actions.bulkResetCounts());
        document.getElementById('editCharSetName').addEventListener('change', (e) => this.changeCharSet(e.target.value));

        // 設定
        document.getElementById('settingsOverlay').addEventListener('click', () => this.toggleSettings(false));
        document.getElementById('btn-save-settings').addEventListener('click', () => Actions.saveSettings());
        document.getElementById('btn-export-backup').addEventListener('click', () => Actions.exportBackup());
        document.getElementById('btn-import-trigger').addEventListener('click', () => document.getElementById('importFile').click());
        document.getElementById('importFile').addEventListener('change', (e) => Actions.importBackup(e));
    },

    /** タブ切り替え */
    switchMainTab(tab) {
        const isList = tab === 'list';
        document.getElementById('seriesView').style.display = isList ? 'block' : 'none';
        document.getElementById('missingView').style.display = isList ? 'none' : 'block';
        document.getElementById('tab-list').classList.toggle('active', isList);
        document.getElementById('tab-missing').classList.toggle('active', !isList);
        document.getElementById('mainFab').style.display = isList ? 'flex' : 'none';
        
        if (isList) Render.seriesList();
        else Render.missingList();
    },

    /** ソートモード変更 */
    setSortMode(mode) {
        Store.sortMode = mode;
        document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`sort-${mode}`).classList.add('active');
        Render.seriesList();
        Store.save();
    },

    /** 設定パネルの開閉 */
    toggleSettings(open) {
        const panel = document.getElementById('settingsPanel');
        const overlay = document.getElementById('settingsOverlay');
        if (open) {
            this.fillSettingsFields();
            panel.style.right = '0';
            overlay.style.display = 'block';
        } else {
            panel.style.right = '-85%';
            overlay.style.display = 'none';
        }
    },

    /** 設定項目の反映 */
    fillSettingsFields() {
        document.getElementById('tradePrefixInput').value = Store.tradeConfig.prefix || "";
        document.getElementById('tradeSuffixInput').value = Store.tradeConfig.suffix || "";
        document.getElementById('tradeShowInfMark').checked = Store.tradeConfig.showInf;
        
        const setsText = Object.entries(Store.charSets)
            .map(([k, v]) => `${k}:${v.join(',')}`).join('\n');
        document.getElementById('charSettingsInput').value = setsText;

        const presetsText = Store.presets
            .map(p => `${p.type},${p.setName},${p.targets.join('|')}`).join('\n');
        document.getElementById('presetSettingsInput').value = presetsText;

        document.getElementById('tempSettingsInput').value = Store.templates.join(',');
    },

    // --- 各種モーダル・ビュー制御 ---
    openSeriesModal() { document.getElementById('seriesModal').style.display = 'flex'; },
    closeSeriesModal() { document.getElementById('seriesModal').style.display = 'none'; },
    
    openDetail(id) {
        Store.currentSeriesId = id;
        document.getElementById('detailView').style.display = 'block';
        Render.itemList();
        window.history.pushState({view:'detail'}, "");
    },
    closeDetail() {
        document.getElementById('detailView').style.display = 'none';
        Render.seriesList();
    },

    openItemEditor(idx = null, fromMissing = false) {
        Store.currentItemIdx = idx;
        Store.editorFromMissing = fromMissing;
        const editor = document.getElementById('editorView');
        editor.style.display = 'block';
        
        Render.editorInit();
        window.history.pushState({view:'editor'}, "");
    },
    closeEditor() {
        document.getElementById('editorView').style.display = 'none';
        if (Store.editorFromMissing) {
            Store.editorFromMissing = false;
            Render.missingList();
        }
    },

    /** 日付フィルタ */
    toggleDateFilter() {
        const p = document.getElementById('dateFilterPanel');
        p.style.display = p.style.display === 'none' ? 'block' : 'none';
    },
    clearDateFilter() {
        document.getElementById('filterStart').value = "";
        document.getElementById('filterEnd').value = "";
        Render.seriesList();
    },

    /** 編集中のキャラセット変更 */
    changeCharSet(setName) {
        Store.activeCharList = Store.charSets[setName] || [];
        Render.editorGrid();
    },

    /** 履歴から復元 */
    applyHistory() {
        if (!Store.lastItem) return;
        document.getElementById('editItemType').value = Store.lastItem.type;
        document.getElementById('editCharSetName').value = Store.lastItem.setName;
        this.changeCharSet(Store.lastItem.setName);
        Utils.showToast("履歴を適用しました");
    },

    closeUnboxing() {
        document.getElementById('unboxingModal').style.display = 'none';
        Render.itemList();
    }
};

// =========================================
// 4. Render Engine (表示処理)
// =========================================
const Render = {
    /** シリーズ一覧の描画 */
    seriesList() {
        const container = document.getElementById('seriesListContainer');
        const query = document.getElementById('searchBar').value.toLowerCase();
        const start = document.getElementById('filterStart').value;
        const end = document.getElementById('filterEnd').value;

        // 並び替えロジック
        let list = [...Store.order];
        if (Store.sortMode === 'date') {
            list.sort((a, b) => (Store.db[b].date || "").localeCompare(Store.db[a].date || ""));
        } else if (Store.sortMode === 'new') {
            list.reverse();
        }

        // フィルタリング
        const filtered = list.filter(id => {
            const s = Store.db[id];
            const matchQuery = s.title.toLowerCase().includes(query) || (s.tags || "").toLowerCase().includes(query);
            const sDate = s.date || "";
            const matchStart = !start || sDate >= start;
            const matchEnd = !end || sDate <= end;
            return matchQuery && matchStart && matchEnd;
        });

        container.innerHTML = filtered.map(id => this.createSeriesCard(id)).join('');
        
        // カードにイベント付与
        filtered.forEach(id => {
            const card = document.getElementById(`card-${id}`);
            card.addEventListener('click', () => App.openDetail(id));
            Utils.setupSwipeToDelete(card, id, () => Actions.deleteSeries(id));
        });
    },

    /** シリーズカードのHTML生成 */
    createSeriesCard(id) {
        const s = Store.db[id];
        const tags = (s.tags || "").split(/[,，\s]+/).filter(t => t);
        const isComp = (s.items || []).length > 0 && s.items.every(i => i.status === 'comp');

        return `
            <div class="swipe-container" id="card-${id}">
                <div class="delete-btn-overlay">削除</div>
                <div class="card">
                    ${isComp ? '<span class="status-tag st-comp">COMPLETE</span>' : ''}
                    <div class="text-bold mb-5" style="font-size:0.95rem;">${Utils.escapeHtml(s.title)}</div>
                    <div class="flex align-center mb-10" style="font-size:0.7rem; color:var(--text-sub);">
                        <span>${s.date || '日付未設定'}</span>
                        <div style="margin-left:10px;">
                            ${tags.map(t => `<span class="tag-chip">${Utils.escapeHtml(t)}</span>`).join('')}
                        </div>
                    </div>
                    ${this.createInventoryPreview(s.items || [])}
                </div>
            </div>
        `;
    },

    /** カード内の所有状況プレビュー */
    createInventoryPreview(items) {
        if (items.length === 0) return `<div style="font-size:0.7rem; color:var(--text-sub); border-top:1px solid #f9f9f9; padding-top:10px;">アイテム未登録</div>`;
        
        return items.map(item => {
            const ownCount = Object.values(item.own || {}).reduce((a, b) => a + b, 0);
            return `
                <div style="border-top:1px solid #f9f9f9; padding-top:8px; margin-top:8px;">
                    <div class="flex justify-between align-center mb-5">
                        <span class="text-bold" style="font-size:0.75rem; color:var(--gold);">${Utils.escapeHtml(item.type)}</span>
                        <span style="font-size:0.7rem; color:var(--text-sub);">所有: ${ownCount}</span>
                    </div>
                    <div class="flex flex-wrap">
                        ${(item.targets || []).map(name => {
                            const count = (item.own || {})[name] || 0;
                            const isInf = (item.inf || {})[name];
                            if (count === 0 && !isInf) return '';
                            return `<span class="char-chip c-${name}">${name}${count > 1 ? `×${count}` : ''}${isInf ? '∞' : ''}</span>`;
                        }).join('')}
                    </div>
                </div>
            `;
        }).join('');
    },

    /** 詳細画面：アイテムリストの描画 */
    itemList() {
        const container = document.getElementById('itemListContainer');
        const series = Store.db[Store.currentSeriesId];
        document.getElementById('detailHeaderTitle').textContent = series.title;

        if (!series.items || series.items.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:50px 20px; color:var(--text-sub); font-size:0.8rem;">アイテムがありません。<br>右下の＋ボタンから追加してください。</div>`;
            return;
        }

        container.innerHTML = series.items.map((item, idx) => this.createItemRow(item, idx)).join('');
        
        // アイテム行にイベント付与
        series.items.forEach((item, idx) => {
            document.getElementById(`item-edit-${idx}`).addEventListener('click', () => App.openItemEditor(idx));
            document.getElementById(`item-unbox-${idx}`).addEventListener('click', () => Actions.openUnboxing(idx));
            Utils.setupSwipeToDelete(document.getElementById(`item-row-${idx}`), idx, () => Actions.deleteItem(idx));
        });
    },

    /** アイテム行のHTML生成 */
    createItemRow(item, idx) {
        const statusClass = item.status === 'comp' ? 'st-comp' : (item.status === 'none' ? 'st-none' : 'st-not');
        const statusText = item.status === 'comp' ? 'COMP' : (item.status === 'none' ? '予定なし' : '未コンプ');
        
        const tradeInfo = Utils.generateTradeText(item);

        return `
            <div class="swipe-container" id="item-row-${idx}">
                <div class="delete-btn-overlay">削除</div>
                <div class="card" style="padding:15px;">
                    <span class="status-tag ${statusClass}">${statusText}</span>
                    <div class="flex justify-between mb-10">
                        <div class="text-bold text-gold" style="font-size:0.9rem;">${Utils.escapeHtml(item.type)}</div>
                        <button class="bulk-btn" id="item-edit-${idx}" style="padding:2px 8px;">編集</button>
                    </div>
                    
                    <div class="inventory-grid" id="item-unbox-${idx}">
                        <div class="inv-box">
                            <span class="inv-label">所有</span>
                            <div class="inv-content">
                                ${this.createCharChips(item, 'own')}
                            </div>
                        </div>
                        <div class="inv-box">
                            <span class="inv-label">譲渡可</span>
                            <div class="inv-content">
                                ${this.createCharChips(item, 'stock')}
                            </div>
                        </div>
                        <div class="inv-box" style="background:var(--trade-bg);">
                            <span class="inv-label" style="color:var(--trade-text);">募集文</span>
                            <div class="trade-text-small">${Utils.escapeHtml(tradeInfo.text)}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    /** キャラクターチップの生成 */
    createCharChips(item, type) {
        const data = item[type] || {};
        return (item.targets || []).map(name => {
            const count = data[name] || 0;
            const isInf = type === 'own' && (item.inf || {})[name];
            if (count === 0 && !isInf) return '';
            return `<span class="char-chip c-${name}">${name}${count > 1 ? `×${count}` : ''}${isInf ? '∞' : ''}</span>`;
        }).join('');
    },

    /** 編集画面の初期化 */
    editorInit() {
        const isEdit = Store.currentItemIdx !== null;
        const series = Store.db[Store.currentSeriesId];
        const item = isEdit ? series.items[Store.currentItemIdx] : null;

        // キャラセットのセレクトボックス生成
        const charSel = document.getElementById('editCharSetName');
        charSel.innerHTML = Object.keys(Store.charSets).map(k => `<option value="${k}">${k}</option>`).join('');

        // プリセットの描画
        const presetDiv = document.getElementById('presetChips');
        if (Store.presets.length > 0) {
            document.getElementById('presetArea').style.display = 'block';
            presetDiv.innerHTML = Store.presets.map((p, i) => 
                `<span class="preset-chip" id="preset-${i}">${p.type}</span>`
            ).join('');
            Store.presets.forEach((p, i) => {
                document.getElementById(`preset-${i}`).addEventListener('click', () => Actions.applyPreset(p));
            });
        } else {
            document.getElementById('presetArea').style.display = 'none';
        }

        // 値のセット
        if (isEdit) {
            document.getElementById('editItemType').value = item.type;
            document.getElementById('editCharSetName').value = item.setName || "デフォルト";
            document.getElementById('editItemStatus').value = item.status;
            Store.activeCharList = item.targets || [];
            Store.tempStocks = JSON.parse(JSON.stringify(item.own || {}));
            Store.tempInf = JSON.parse(JSON.stringify(item.inf || {}));
            document.getElementById('historyBanner').style.display = 'none';
        } else {
            document.getElementById('editItemType').value = "";
            document.getElementById('editCharSetName').value = "デフォルト";
            document.getElementById('editItemStatus').value = "not";
            Store.activeCharList = Store.charSets["デフォルト"];
            Store.tempStocks = {};
            Store.tempInf = {};
            document.getElementById('historyBanner').style.display = Store.lastItem ? 'flex' : 'none';
        }

        this.editorGrid();
    },

    /** 編集画面のグリッド描画 */
    editorGrid() {
        const grid = document.getElementById('editorGrid');
        grid.innerHTML = Store.activeCharList.map(name => {
            const count = Store.tempStocks[name] || 0;
            const isInf = Store.tempInf[name] || false;
            return `
                <div class="editor-row">
                    <div class="char-chip c-${name}" style="margin:0; text-align:center; width:100%;">${name}</div>
                    <div class="flex align-center justify-between">
                        <div class="flex align-center gap-10">
                            <button class="btn-qty" id="qty-minus-${name}">−</button>
                            <input type="number" class="qty-display ${count > 0 ? 'qty-has' : 'qty-zero'}" 
                                id="qty-input-${name}" value="${count}" readonly>
                            <button class="btn-qty" id="qty-plus-${name}">＋</button>
                        </div>
                        <button class="inf-btn ${isInf ? 'active' : ''}" id="inf-btn-${name}">∞</button>
                    </div>
                </div>
            `;
        }).join('');

        // 各ボタンにイベント付与
        Store.activeCharList.forEach(name => {
            document.getElementById(`qty-minus-${name}`).addEventListener('click', () => Actions.updateEditorQty(name, -1));
            document.getElementById(`qty-plus-${name}`).addEventListener('click', () => Actions.updateEditorQty(name, 1));
            document.getElementById(`inf-btn-${name}`).addEventListener('click', () => Actions.toggleEditorInf(name));
        });
    },

    /** ミッシング（未所有）リストの描画 */
    missingList() {
        const container = document.getElementById('missingListContainer');
        let html = '';
        let hasMissing = false;

        Store.order.forEach(sId => {
            const series = Store.db[sId];
            const missingInSeries = (series.items || []).map((item, idx) => {
                const missingChars = (item.targets || []).filter(name => !item.own?.[name]);
                if (missingChars.length === 0 || item.status === 'none') return null;
                return { item, idx, missingChars };
            }).filter(Boolean);

            if (missingInSeries.length > 0) {
                hasMissing = true;
                html += `
                    <div class="card mb-15">
                        <div class="text-gold text-bold mb-10" style="font-size:0.8rem; border-bottom:1px solid var(--gold-light); padding-bottom:5px;">
                            ${Utils.escapeHtml(series.title)}
                        </div>
                        ${missingInSeries.map(m => `
                            <div class="mb-10">
                                <div class="flex justify-between align-center">
                                    <span style="font-size:0.75rem; font-weight:800;">${Utils.escapeHtml(m.item.type)}</span>
                                    <button class="bulk-btn" id="missing-jump-${sId}-${m.idx}" style="font-size:0.6rem;">編集へ</button>
                                </div>
                                <div class="flex flex-wrap mt-5">
                                    ${m.missingChars.map(c => `<span class="char-chip c-default" style="opacity:0.6;">${c}</span>`).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        });

        container.innerHTML = hasMissing ? html : `<div style="text-align:center; padding:100px 20px; color:var(--text-sub);">すべてのアイテムが揃っています！</div>`;
        
        // ジャンプボタンにイベント付与
        if (hasMissing) {
            Store.order.forEach(sId => {
                const series = Store.db[sId];
                (series.items || []).forEach((_, idx) => {
                    const btn = document.getElementById(`missing-jump-${sId}-${idx}`);
                    if (btn) btn.addEventListener('click', () => {
                        Store.currentSeriesId = sId;
                        App.openItemEditor(idx, true);
                    });
                });
            });
        }
    }
};

// =========================================
// 5. Action Logic (データ操作)
// =========================================
const Actions = {
    /** シリーズの新規保存 */
    async saveSeriesModal() {
        const title = document.getElementById('msTitle').value.trim();
        if (!title) return Utils.showToast("タイトルを入力してください");

        const id = "s" + Date.now();
        const date = document.getElementById('msDate').value;
        const tags = document.getElementById('msTags').value;
        const useTemp = document.getElementById('msUseTemplate').checked;

        const newSeries = { id, title, date, tags, items: [] };

        if (useTemp && Store.templates.length > 0) {
            newSeries.items = Store.templates.map(type => ({
                type, status: 'not', targets: Store.charSets["デフォルト"] || [], 
                setName: "デフォルト", own: {}, stock: {}, inf: {}
            }));
        }

        Store.db[id] = newSeries;
        Store.order.push(id);
        await Store.save();

        document.getElementById('msTitle').value = "";
        App.closeSeriesModal();
        Render.seriesList();
        Utils.showToast("シリーズを登録しました");
    },

    /** アイテムの保存 */
    async saveItem() {
        const type = document.getElementById('editItemType').value.trim();
        if (!type) return Utils.showToast("アイテム名を入力してください");

        const isEdit = Store.currentItemIdx !== null;
        const series = Store.db[Store.currentSeriesId];
        const setName = document.getElementById('editCharSetName').value;
        
        const itemData = {
            type,
            setName,
            targets: Store.activeCharList,
            own: Store.tempStocks,
            inf: Store.tempInf,
            status: document.getElementById('editItemStatus').value,
            stock: isEdit ? series.items[Store.currentItemIdx].stock : {}
        };

        // ステータスの自動判定
        if (itemData.status !== 'none') {
            const isComp = itemData.targets.every(name => itemData.own[name] > 0);
            itemData.status = isComp ? 'comp' : 'not';
        }

        if (isEdit) {
            series.items[Store.currentItemIdx] = itemData;
        } else {
            series.items.push(itemData);
        }

        // 履歴保存
        Store.lastItem = { type, setName };
        
        await Store.save();
        App.closeEditor();
        Render.itemList();
        Utils.showToast("保存しました");
    },

    /** 開封（Unboxing）画面を開く */
    openUnboxing(idx) {
        const item = Store.db[Store.currentSeriesId].items[idx];
        Store.currentItemIdx = idx;
        
        document.getElementById('unboxingTitle').textContent = item.type;
        const grid = document.getElementById('unboxingGrid');
        
        grid.innerHTML = (item.targets || []).map(name => {
            const own = item.own?.[name] || 0;
            const stock = item.stock?.[name] || 0;
            return `
                <div class="unboxing-panel">
                    <div class="ub-char-label">${name}</div>
                    <div class="ub-area ub-area-left" id="ub-left-${name}">
                        <div class="unboxing-count-badge ${own > 0 ? 'has-count' : 'is-zero'}" id="ub-own-val-${name}">${own}</div>
                        <div style="font-size:0.5rem; opacity:0.6;">保管</div>
                    </div>
                    <div class="ub-area ub-area-right" id="ub-right-${name}">
                        <div class="unboxing-count-badge ${stock > 0 ? 'has-count' : 'is-zero'}" id="ub-stock-val-${name}">${stock}</div>
                        <div style="font-size:0.5rem; opacity:0.6;">譲渡</div>
                    </div>
                </div>
            `;
        }).join('');

        // イベント付与（クリックで＋、長押しでー）
        item.targets.forEach(name => {
            this.bindUnboxingEvents(name, 'own', 'left');
            this.bindUnboxingEvents(name, 'stock', 'right');
        });

        this.updateUnboxingTotal();
        document.getElementById('unboxingModal').style.display = 'flex';
    },

    /** Unboxing用イベントバインド */
    bindUnboxingEvents(name, type, side) {
        const el = document.getElementById(`ub-${side}-${name}`);
        let timer;
        
        const handleAdd = (e) => {
            e.preventDefault();
            this.updateUnboxingQty(name, type, 1);
            timer = setTimeout(() => { // 長押し検知
                this.updateUnboxingQty(name, type, -2); // ＋1分を相殺してー1
            }, 600);
        };
        
        const handleEnd = () => clearTimeout(timer);

        el.addEventListener('touchstart', handleAdd);
        el.addEventListener('touchend', handleEnd);
        el.addEventListener('mousedown', handleAdd);
        el.addEventListener('mouseup', handleEnd);
    },

    /** 個数更新：Unboxing */
    updateUnboxingQty(name, type, delta) {
        const item = Store.db[Store.currentSeriesId].items[Store.currentItemIdx];
        if (!item[type]) item[type] = {};
        
        item[type][name] = Math.max(0, (item[type][name] || 0) + delta);
        
        // 表示更新
        const badge = document.getElementById(`ub-${type}-val-${name}`);
        badge.textContent = item[type][name];
        badge.className = `unboxing-count-badge ${item[type][name] > 0 ? 'has-count' : 'is-zero'}`;
        
        this.updateUnboxingTotal();
        Store.save();
    },

    updateUnboxingTotal() {
        const item = Store.db[Store.currentSeriesId].items[Store.currentItemIdx];
        const total = [...Object.values(item.own || {}), ...Object.values(item.stock || {})].reduce((a, b) => a + b, 0);
        document.getElementById('unboxingTotalCount').textContent = `合計開封数: ${total}`;
    },

    /** 設定の保存 */
    async saveSettings() {
        Store.tradeConfig.prefix = document.getElementById('tradePrefixInput').value;
        Store.tradeConfig.suffix = document.getElementById('tradeSuffixInput').value;
        Store.tradeConfig.showInf = document.getElementById('tradeShowInfMark').checked;

        // キャラセット解析
        const setsLines = document.getElementById('charSettingsInput').value.split('\n');
        const newSets = {};
        setsLines.forEach(line => {
            const [name, chars] = line.split(':');
            if (name && chars) newSets[name.trim()] = chars.split(',').map(c => c.trim());
        });
        if (Object.keys(newSets).length > 0) Store.charSets = newSets;

        // プリセット解析
        const presetLines = document.getElementById('presetSettingsInput').value.split('\n');
        Store.presets = presetLines.map(line => {
            const [type, setName, targets] = line.split(',');
            if (!type || !setName || !targets) return null;
            return { type: type.trim(), setName: setName.trim(), targets: targets.split('|').map(t => t.trim()) };
        }).filter(Boolean);

        // テンプレート解析
        Store.templates = document.getElementById('tempSettingsInput').value.split(',').map(t => t.trim()).filter(Boolean);

        await Store.save();
        App.toggleSettings(false);
        Render.seriesList();
        Utils.showToast("設定を保存しました");
    },

    // --- その他編集操作 ---
    updateEditorQty(name, delta) {
        Store.tempStocks[name] = Math.max(0, (Store.tempStocks[name] || 0) + delta);
        const input = document.getElementById(`qty-input-${name}`);
        input.value = Store.tempStocks[name];
        input.className = `qty-display ${Store.tempStocks[name] > 0 ? 'qty-has' : 'qty-zero'}`;
    },

    toggleEditorInf(name) {
        Store.tempInf[name] = !Store.tempInf[name];
        document.getElementById(`inf-btn-${name}`).classList.toggle('active', Store.tempInf[name]);
    },

    applyPreset(preset) {
        document.getElementById('editItemType').value = preset.type;
        document.getElementById('editCharSetName').value = preset.setName;
        Store.activeCharList = preset.targets;
        Render.editorGrid();
    },

    bulkToggleTargets(val) {
        Store.activeCharList.forEach(name => {
            Store.tempStocks[name] = val ? 1 : 0;
        });
        Render.editorGrid();
    },

    bulkIncrementOwn() {
        Store.activeCharList.forEach(name => {
            Store.tempStocks[name] = (Store.tempStocks[name] || 0) + 1;
        });
        Render.editorGrid();
    },

    bulkResetCounts() {
        if (!confirm("すべての個数を0にしますか？")) return;
        Store.tempStocks = {};
        Store.tempInf = {};
        Render.editorGrid();
    },

    async deleteSeries(id) {
        if (!confirm("このシリーズを削除しますか？")) return;
        delete Store.db[id];
        Store.order = Store.order.filter(oid => oid !== id);
        await Store.save();
        Render.seriesList();
    },

    async deleteItem(idx) {
        if (!confirm("このアイテムを削除しますか？")) return;
        Store.db[Store.currentSeriesId].items.splice(idx, 1);
        await Store.save();
        Render.itemList();
    },

    async deleteAllItems() {
        if (!confirm("このシリーズのアイテムをすべて削除しますか？")) return;
        Store.db[Store.currentSeriesId].items = [];
        await Store.save();
        Render.itemList();
    },

    /** バックアップ出力 */
    exportBackup() {
        const data = { db: Store.db, order: Store.order, charSets: Store.charSets, presets: Store.presets, templates: Store.templates };
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `collection_archive_backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
    },

    /** バックアップ読込 */
    importBackup(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                Store.db = data.db || {};
                Store.order = data.order || [];
                Store.charSets = data.charSets || Store.charSets;
                Store.presets = data.presets || [];
                Store.templates = data.templates || Store.templates;
                await Store.save();
                location.reload();
            } catch (err) {
                alert("バックアップファイルの形式が正しくありません");
            }
        };
        reader.readAsText(file);
    }
};

// =========================================
// 6. Utility Helper (補助機能)
// =========================================
const Utils = {
    /** HTMLエスケープ（XSS対策） */
    escapeHtml(str) {
        if (!str) return "";
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return str.replace(/[&<>"']/g, m => map[m]);
    },

    /** トースト通知の表示 */
    showToast(msg) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.style.display = 'block';
        setTimeout(() => t.style.display = 'none', 2000);
    },

    /** 募集文の自動生成 */
    generateTradeText(item) {
        const config = Store.tradeConfig;
        const stocks = (item.targets || []).filter(name => (item.stock?.[name] || 0) > 0);
        const needs = (item.targets || []).filter(name => !item.own?.[name] || (item.inf?.[name]));

        if (stocks.length === 0 && needs.length === 0) return { text: "交換情報なし" };

        let text = `${config.prefix}${item.type} 交換\n`;
        text += `譲：${stocks.map(n => n + (item.stock[n] > 1 ? `(${item.stock[n]})` : '')).join('、')}\n`;
        text += `求：${needs.map(n => n + (item.inf?.[name] && config.showInf ? '(∞)' : '')).join('、')}\n`;
        text += config.suffix;

        return { text };
    },

    /** スワイプで削除のUI実装 */
    setupSwipeToDelete(el, id, onDelete) {
        let startX = 0;
        let currentX = 0;
        const card = el.querySelector('.card');
        
        el.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            card.style.transition = 'none';
        }, {passive: true});

        el.addEventListener('touchmove', (e) => {
            currentX = e.touches[0].clientX - startX;
            if (currentX < 0) {
                const x = Math.max(currentX, -100);
                card.style.transform = `translateX(${x}px)`;
            }
        }, {passive: true});

        el.addEventListener('touchend', () => {
            card.style.transition = 'transform 0.3s cubic-bezier(0.2, 0, 0, 1)';
            if (currentX < -70) {
                onDelete();
            }
            card.style.transform = 'translateX(0)';
            currentX = 0;
        });
    }
};

// 起動
document.addEventListener('DOMContentLoaded', () => App.init());
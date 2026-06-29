(function (global) {
  const STATUS_META = {
    idle: { label: "—", class: "status-idle" },
    running: { label: "执行中", class: "status-running" },
    retry: { label: "重试", class: "status-retry" },
    success: { label: "成功", class: "status-success" },
    failed: { label: "失败", class: "status-failed" },
  };

  function generateId() {
    return (
      "task_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  const TreeController = {
    container: null,
    tasks: [],
    statusMap: {},
    dragId: null,
    onChange: null,

    init(container, tasks = [], onChange = null) {
      this.container = container;
      this.tasks = tasks || [];
      this.onChange = onChange;
      this.render();
    },

    // ---------- queries ----------
    findEntry(tasks, taskId, parent = null, index = 0) {
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        if (task.task_id === taskId) {
          return {
            task,
            parent,
            index: i,
            siblings: tasks,
            prev: i > 0 ? tasks[i - 1] : null,
            next: i < tasks.length - 1 ? tasks[i + 1] : null,
          };
        }
        if (task.type === "group" && task.children) {
          const found = this.findEntry(task.children, taskId, task, i);
          if (found) return found;
        }
      }
      return null;
    },

    _contains(task, ancestorId) {
      if (task.task_id === ancestorId) return true;
      if (task.type === "group" && task.children) {
        for (const child of task.children) {
          if (this._contains(child, ancestorId)) return true;
        }
      }
      return false;
    },

    isDescendant(ancestorId, taskId, tasks = this.tasks) {
      for (const task of tasks) {
        if (task.task_id === taskId) {
          return this._contains(task, ancestorId);
        }
        if (task.type === "group" && task.children) {
          const found = this.isDescendant(ancestorId, taskId, task.children);
          if (found) return true;
        }
      }
      return false;
    },

    // ---------- mutations ----------
    removeFromParent(tasks, taskId) {
      for (let i = 0; i < tasks.length; i++) {
        if (tasks[i].task_id === taskId) {
          const removed = tasks.splice(i, 1)[0];
          return removed;
        }
        if (tasks[i].type === "group" && tasks[i].children) {
          const removed = this.removeFromParent(tasks[i].children, taskId);
          if (removed) return removed;
        }
      }
      return null;
    },

    attachAsChild(tasks, childId, parentId) {
      if (childId === parentId) return false;
      const parentEntry = this.findEntry(tasks, parentId);
      if (!parentEntry || parentEntry.task.type !== "group") return false;
      const parent = parentEntry.task;
      if (this.isDescendant(childId, parentId, tasks)) return false;
      const child = this.removeFromParent(tasks, childId);
      if (!child) return false;
      parent.children = parent.children || [];
      if (!parent.children.find((c) => c.task_id === childId)) {
        parent.children.push(child);
      }
      return true;
    },

    insertRelative(tasks, draggedId, targetId, relation) {
      if (draggedId === targetId) return false;
      const targetEntry = this.findEntry(tasks, targetId);
      const draggedNode = this.findEntry(tasks, draggedId)?.task;
      if (!targetEntry || !draggedNode) return false;
      const target = targetEntry.task;

      if (relation === "child") {
        if (target.type !== "group") return false;
        return this.attachAsChild(tasks, draggedId, targetId);
      }

      // before / after
      this.removeFromParent(tasks, draggedId);
      const siblings = targetEntry.siblings;
      const targetIdx = siblings.findIndex((t) => t.task_id === targetId);
      if (targetIdx < 0) return false;
      const insertIdx = relation === "before" ? targetIdx : targetIdx + 1;
      siblings.splice(insertIdx, 0, draggedNode);
      return true;
    },

    // ---------- public API ----------
    exportTasks() {
      return JSON.parse(JSON.stringify(this.tasks));
    },

    normalizeTask(task) {
      if (!task.task_id) {
        task.task_id = generateId();
      }
      if (task.type === "group" && task.children) {
        task.children.forEach((child) => this.normalizeTask(child));
      }
      return task;
    },

    importTasks(tasks) {
      this.tasks = (tasks || []).map((t) => this.normalizeTask(t));
      this.statusMap = {};
      this.render();
      this._notifyChange();
    },

    addCourse(course, electionId, electionName) {
      const task = {
        type: "course",
        id: String(course.id || ""),
        name: course.name || "",
        no: course.no || "",
        teachers: course.teachers || "",
        election_id: electionId,
        election_name: electionName || electionId,
        task_id: generateId(),
      };
      this.tasks.push(task);
      this.render();
      this._notifyChange();
      return task;
    },

    addGroup(op = "all") {
      const task = {
        type: "group",
        op,
        children: [],
        task_id: generateId(),
      };
      this.tasks.push(task);
      this.render();
      this._notifyChange();
      return task;
    },

    clear() {
      this.tasks = [];
      this.statusMap = {};
      this.render();
      this._notifyChange();
    },

    deleteTask(taskId) {
      this.removeFromParent(this.tasks, taskId);
      delete this.statusMap[taskId];
      this.render();
      this._notifyChange();
    },

    setStatus(taskId, status) {
      if (!taskId) return;
      this.statusMap[taskId] = status;
      const badge = this.container?.querySelector(
        `[data-task-id="${taskId}"] .tree-status`
      );
      if (badge) {
        const meta = STATUS_META[status] || STATUS_META.idle;
        badge.className = "tree-status " + meta.class;
        badge.textContent = meta.label;
      }
    },

    clearStatuses() {
      this.statusMap = {};
      this.render();
    },

    _notifyChange() {
      if (typeof this.onChange === "function") {
        this.onChange(this.exportTasks());
      }
    },

    // ---------- rendering ----------
    render() {
      if (!this.container) return;
      this.container.innerHTML = "";
      if (this.tasks.length === 0) {
        this.container.innerHTML =
          '<div class="text-muted">暂无任务，请从上方课程列表添加课程，或点击工具栏添加组合节点</div>';
        return;
      }
      const ul = document.createElement("ul");
      ul.className = "tree-list";
      this.tasks.forEach((task) => ul.appendChild(this.renderNode(task)));
      this.container.appendChild(ul);
    },

    renderNode(task) {
      const li = document.createElement("li");
      const item = document.createElement("div");
      item.className = "tree-item";
      item.draggable = true;
      item.dataset.taskId = task.task_id;

      let icon;
      let name;
      let opSelect = null;

      if (task.type === "course") {
        item.classList.add("tree-item-course");
        icon = "●";
        name = `${task.id} ${task.name || ""}`.trim();
        const batch = task.election_name
          ? `[${task.election_name}] `
          : "";
        name = batch + name;
      } else {
        const colorClass =
          task.op === "all"
            ? "tree-item-group-all"
            : task.op === "any"
            ? "tree-item-group-any"
            : "tree-item-group-seq";
        item.classList.add(colorClass);
        icon = task.op === "all" ? "&" : task.op === "any" ? "∥" : "⏵";
        name = `[${task.op.toUpperCase()}] 组合`;

        opSelect = document.createElement("select");
        opSelect.className = "tree-op-select";
        ["all", "any", "sequence"].forEach((op) => {
          const opt = document.createElement("option");
          opt.value = op;
          opt.textContent = op.toUpperCase();
          if (op === task.op) opt.selected = true;
          opSelect.appendChild(opt);
        });
        opSelect.onchange = (e) => this.changeOp(task.task_id, e.target.value);
      }

      const iconSpan = document.createElement("span");
      iconSpan.className = "tree-item-icon";
      iconSpan.innerHTML = icon;
      const nameSpan = document.createElement("span");
      nameSpan.className = "tree-item-name";
      nameSpan.textContent = name;

      const statusMeta = STATUS_META[this.statusMap[task.task_id]] || STATUS_META.idle;
      const statusSpan = document.createElement("span");
      statusSpan.className = "tree-status " + statusMeta.class;
      statusSpan.textContent = statusMeta.label;

      const actions = document.createElement("div");
      actions.className = "tree-item-actions";
      actions.appendChild(
        this.makeBtn("↑", () => this.moveUp(task.task_id), "上移")
      );
      actions.appendChild(
        this.makeBtn("↓", () => this.moveDown(task.task_id), "下移")
      );
      actions.appendChild(
        this.makeBtn("→", () => this.indent(task.task_id), "缩进为上一个节点的子节点")
      );
      actions.appendChild(
        this.makeBtn("←", () => this.outdent(task.task_id), "提升一级")
      );
      actions.appendChild(
        this.makeBtn("×", () => this.deleteTask(task.task_id), "删除")
      );

      item.append(iconSpan, nameSpan, statusSpan);
      if (opSelect) item.appendChild(opSelect);
      item.appendChild(actions);
      li.appendChild(item);

      // drag events
      item.ondragstart = (e) => this.onDragStart(e, task.task_id);
      item.ondragover = (e) => this.onDragOver(e, task.task_id);
      item.ondragleave = (e) => this.onDragLeave(e, task.task_id);
      item.ondrop = (e) => this.onDrop(e, task.task_id);
      item.ondragend = (e) => {
        this.dragId = null;
        this.clearDropClasses(e.currentTarget);
      };

      if (task.type === "group" && task.children && task.children.length > 0) {
        const childrenUl = document.createElement("ul");
        childrenUl.className = "tree-children";
        task.children.forEach((child) =>
          childrenUl.appendChild(this.renderNode(child))
        );
        li.appendChild(childrenUl);
      }
      return li;
    },

    makeBtn(text, onClick, title) {
      const btn = document.createElement("button");
      btn.className = "tree-btn";
      btn.textContent = text;
      btn.title = title || "";
      btn.draggable = false;
      btn.onclick = onClick;
      return btn;
    },

    // ---------- drag & drop ----------
    onDragStart(e, taskId) {
      this.dragId = taskId;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(taskId));
      e.currentTarget.classList.add("dragging");
    },

    onDragOver(e, taskId) {
      e.preventDefault();
      if (this.dragId == null || this.dragId === taskId) return;
      if (this.isDescendant(this.dragId, taskId, this.tasks)) return;

      const item = e.currentTarget;
      const rect = item.getBoundingClientRect();
      const ratio = (e.clientY - rect.top) / rect.height;
      const target = this.findEntry(this.tasks, taskId)?.task;
      let relation;
      if (ratio < 0.25) {
        relation = "before";
      } else if (ratio > 0.75) {
        relation = "after";
      } else if (target && target.type === "group") {
        relation = "child";
      } else {
        relation = ratio < 0.5 ? "before" : "after";
      }

      this.clearDropClasses(item);
      item.classList.add("drop-" + relation);
      e.dataTransfer.dropEffect = "move";
    },

    onDragLeave(e, taskId) {
      this.clearDropClasses(e.currentTarget);
    },

    onDrop(e, taskId) {
      e.preventDefault();
      const item = e.currentTarget;
      const relation = ["before", "after", "child"].find((cls) =>
        item.classList.contains("drop-" + cls)
      );
      this.clearDropClasses(item);
      if (this.dragId == null || !relation) return;

      const changed = this.insertRelative(
        this.tasks,
        this.dragId,
        taskId,
        relation
      );
      this.dragId = null;
      if (changed) {
        this.render();
        this._notifyChange();
      }
    },

    clearDropClasses(item) {
      if (!item) return;
      item.classList.remove(
        "drop-before",
        "drop-after",
        "drop-child",
        "dragging"
      );
    },

    // ---------- button actions ----------
    changeOp(taskId, op) {
      const entry = this.findEntry(this.tasks, taskId);
      if (!entry || entry.task.type !== "group") return;
      entry.task.op = op;
      this.render();
      this._notifyChange();
    },

    moveUp(taskId) {
      const entry = this.findEntry(this.tasks, taskId);
      if (!entry || !entry.prev) return;
      const changed = this.insertRelative(
        this.tasks,
        taskId,
        entry.prev.task_id,
        "before"
      );
      if (changed) {
        this.render();
        this._notifyChange();
      }
    },

    moveDown(taskId) {
      const entry = this.findEntry(this.tasks, taskId);
      if (!entry || !entry.next) return;
      const changed = this.insertRelative(
        this.tasks,
        taskId,
        entry.next.task_id,
        "after"
      );
      if (changed) {
        this.render();
        this._notifyChange();
      }
    },

    indent(taskId) {
      const entry = this.findEntry(this.tasks, taskId);
      if (!entry || !entry.prev || entry.prev.type !== "group") return;
      const changed = this.attachAsChild(
        this.tasks,
        taskId,
        entry.prev.task_id
      );
      if (changed) {
        this.render();
        this._notifyChange();
      }
    },

    outdent(taskId) {
      const entry = this.findEntry(this.tasks, taskId);
      if (!entry || !entry.parent) return;
      const changed = this.insertRelative(
        this.tasks,
        taskId,
        entry.parent.task_id,
        "after"
      );
      if (changed) {
        this.render();
        this._notifyChange();
      }
    },
  };

  global.TreeController = TreeController;
})(window);

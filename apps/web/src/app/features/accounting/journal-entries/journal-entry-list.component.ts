import {
  Component,
  OnInit,
  TemplateRef,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
} from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { AppPermissions } from '../../../core/permissions/permissions.constants';
import { PermissionService } from '../../../core/permissions/permission.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { apiErrorMessage } from '../../../shared/utils/api-error.util';
import {
  Account,
  JournalEntry,
  JournalEntryStatus,
} from '../models/accounting.models';
import { AccountService } from '../accounts/account.service';
import { JournalEntryService } from './journal-entry.service';

const STATUSES: JournalEntryStatus[] = ['DRAFT', 'POSTED', 'VOID'];
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

/** Sums decimal strings using integer (BigInt) math — never floats. */
function sumDecimalStrings(values: string[]): string {
  const scale = 6;
  let total = 0n;
  for (const raw of values) {
    const match = String(raw ?? '')
      .trim()
      .match(/^(-?)(\d+)(?:\.(\d+))?$/);
    if (!match) {
      continue;
    }
    const sign = match[1] === '-' ? -1n : 1n;
    const frac = (match[3] ?? '').padEnd(scale, '0').slice(0, scale);
    total += sign * BigInt(match[2] + frac);
  }
  const negative = total < 0n;
  const abs = negative ? -total : total;
  const padded = abs.toString().padStart(scale + 1, '0');
  const intPart = padded.slice(0, -scale) || '0';
  const fracPart = padded.slice(-scale, -scale + 2);
  return `${negative ? '-' : ''}${intPart}.${fracPart}`;
}

@Component({
  selector: 'app-journal-entry-list',
  templateUrl: './journal-entry-list.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class JournalEntryListComponent implements OnInit {
  @ViewChild('formModal') formModal!: TemplateRef<unknown>;
  @ViewChild('postModal') postModal!: TemplateRef<unknown>;

  private readonly journalEntries = inject(JournalEntryService);
  private readonly accountService = inject(AccountService);
  private readonly fb = inject(FormBuilder);
  private readonly modal = inject(NgbModal);
  private readonly toast = inject(ToastService);
  private readonly permissions = inject(PermissionService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly canCreate = this.permissions.has(AppPermissions.JOURNAL_ENTRIES_CREATE);
  readonly canUpdate = this.permissions.has(AppPermissions.JOURNAL_ENTRIES_UPDATE);
  readonly canPost = this.permissions.has(AppPermissions.JOURNAL_ENTRIES_POST);
  readonly statuses = STATUSES;

  items: JournalEntry[] = [];
  private allAccounts: Account[] = [];
  accounts: Account[] = [];
  loading = false;
  error: string | null = null;
  filter = '';
  statusFilter: JournalEntryStatus | '' = '';
  saving = false;
  posting = false;
  editing: JournalEntry | null = null;
  postTarget: JournalEntry | null = null;
  private modalRef?: NgbModalRef;

  form = this.fb.group({
    entryDate: ['', Validators.required],
    description: ['', Validators.maxLength(500)],
    lines: this.fb.array([this.createLineGroup(1)]),
  });

  ngOnInit(): void {
    this.loadAccounts();
    this.load();
  }

  get lines(): FormArray {
    return this.form.get('lines') as FormArray;
  }

  get filtered(): JournalEntry[] {
    const q = this.filter.trim().toLowerCase();
    return this.items.filter((item) => {
      const matchesQuery =
        !q ||
        item.entryNumber.toLowerCase().includes(q) ||
        (item.description ?? '').toLowerCase().includes(q);
      const matchesStatus = !this.statusFilter || item.status === this.statusFilter;
      return matchesQuery && matchesStatus;
    });
  }

  createLineGroup(
    lineNumber: number,
    accountId = '',
    debitAmount = '',
    creditAmount = '',
    description = '',
  ): FormGroup {
    return this.fb.group({
      lineNumber: [lineNumber],
      accountId: [accountId, Validators.required],
      debitAmount: [debitAmount, [Validators.required, Validators.pattern(DECIMAL_PATTERN)]],
      creditAmount: [creditAmount, [Validators.required, Validators.pattern(DECIMAL_PATTERN)]],
      description: [description, Validators.maxLength(500)],
    });
  }

  accountLabel(id: string): string {
    const account = this.allAccounts.find((a) => a.id === id);
    if (!account) {
      return id.slice(0, 8);
    }
    return account.isActive
      ? `${account.code} - ${account.name}`
      : `${account.code} - ${account.name} (INACTIVE)`;
  }

  /** Active accounts, plus any inactive accounts already used by this entry's lines (so their value stays visible). */
  private accountOptionsFor(item: JournalEntry): Account[] {
    const active = this.allAccounts.filter((a) => a.isActive);
    const inactiveUsed = new Map<string, Account>();
    for (const line of item.lines ?? []) {
      const account = this.allAccounts.find((a) => a.id === line.accountId);
      if (account && !account.isActive) {
        inactiveUsed.set(account.id, account);
      }
    }
    return [...active, ...inactiveUsed.values()];
  }

  isEditable(item: JournalEntry): boolean {
    return item.status === 'DRAFT';
  }

  totalDebit(item: JournalEntry): string {
    return sumDecimalStrings((item.lines ?? []).map((l) => l.debitAmount));
  }

  totalCredit(item: JournalEntry): string {
    return sumDecimalStrings((item.lines ?? []).map((l) => l.creditAmount));
  }

  get formDebitTotal(): string {
    return sumDecimalStrings(this.lines.controls.map((c) => c.get('debitAmount')?.value ?? '0'));
  }

  get formCreditTotal(): string {
    return sumDecimalStrings(this.lines.controls.map((c) => c.get('creditAmount')?.value ?? '0'));
  }

  loadAccounts(): void {
    this.accountService.list().subscribe({
      next: (res) => {
        this.allAccounts = res.items ?? [];
        this.accounts = this.allAccounts.filter((a) => a.isActive);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'Failed to load accounts'));
        this.cdr.detectChanges();
      },
    });
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.cdr.detectChanges();
    this.journalEntries.list().subscribe({
      next: (res) => {
        this.items = res.items ?? [];
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.error = apiErrorMessage(err, 'Failed to load journal entries');
        this.cdr.detectChanges();
      },
    });
  }

  addLine(): void {
    this.lines.push(this.createLineGroup(this.lines.length + 1));
  }

  removeLine(index: number): void {
    if (this.lines.length <= 1) {
      return;
    }
    this.lines.removeAt(index);
    this.lines.controls.forEach((control, i) => {
      control.get('lineNumber')?.setValue(i + 1);
    });
  }

  openCreate(): void {
    if (!this.canCreate) {
      return;
    }
    this.editing = null;
    this.accounts = this.allAccounts.filter((a) => a.isActive);
    this.form.reset({
      entryDate: '',
      description: '',
    });
    this.lines.clear();
    this.lines.push(this.createLineGroup(1));
    this.cdr.detectChanges();
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'xl' });
  }

  openEdit(item: JournalEntry): void {
    if (!this.canUpdate || !this.isEditable(item)) {
      return;
    }
    this.editing = item;
    this.accounts = this.accountOptionsFor(item);
    this.form.reset({
      entryDate: item.entryDate ? item.entryDate.slice(0, 10) : '',
      description: item.description ?? '',
    });
    this.lines.clear();
    for (const line of item.lines ?? []) {
      this.lines.push(
        this.createLineGroup(
          line.lineNumber,
          line.accountId,
          line.debitAmount,
          line.creditAmount,
          line.description ?? '',
        ),
      );
    }
    if (this.lines.length === 0) {
      this.lines.push(this.createLineGroup(1));
    }
    this.cdr.detectChanges();
    this.modalRef = this.modal.open(this.formModal, { centered: true, size: 'xl' });
  }

  save(): void {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const description = value.description?.trim() || undefined;
    const rawLines = this.lines.getRawValue() as Array<{
      lineNumber: number;
      accountId: string;
      debitAmount: string;
      creditAmount: string;
      description: string;
    }>;
    const lines = rawLines.map((line) => ({
      lineNumber: line.lineNumber,
      accountId: line.accountId,
      debitAmount: String(line.debitAmount).trim(),
      creditAmount: String(line.creditAmount).trim(),
      description: line.description?.trim() || undefined,
    }));

    this.saving = true;
    this.cdr.detectChanges();

    const request$ = this.editing
      ? this.journalEntries.update(this.editing.id, {
          entryDate: value.entryDate!.trim(),
          description: description ?? null,
          lines,
        })
      : this.journalEntries.create({
          entryDate: value.entryDate!.trim(),
          description,
          lines,
        });

    request$.subscribe({
      next: () => {
        this.saving = false;
        this.modalRef?.close();
        this.toast.success(this.editing ? 'Journal entry updated' : 'Journal entry created');
        this.load();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.saving = false;
        this.toast.error(apiErrorMessage(err, 'Save failed'));
        this.cdr.detectChanges();
      },
    });
  }

  askPost(item: JournalEntry): void {
    if (!this.canPost || item.status !== 'DRAFT') {
      return;
    }
    this.postTarget = item;
    this.modal.open(this.postModal, { centered: true });
  }

  confirmPost(modalRef: { close: () => void }): void {
    if (!this.postTarget || this.posting) {
      return;
    }
    const target = this.postTarget;
    this.posting = true;
    this.cdr.detectChanges();
    this.journalEntries.post(target.id).subscribe({
      next: () => {
        this.posting = false;
        modalRef.close();
        this.postTarget = null;
        this.toast.success('Journal entry posted');
        this.load();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.posting = false;
        this.toast.error(apiErrorMessage(err, 'Post failed'));
        this.cdr.detectChanges();
      },
    });
  }
}

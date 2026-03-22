import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { externalContactsApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { useFormatCurrency } from '../../lib/currency';
import { useT } from '../../lib/i18n';
import { getErrorMessage } from '../../lib/utils';
import { ExternalProductOutModal } from '../../components/forms/ExternalProductOutModal';
import { ExternalPaymentInModal } from '../../components/forms/ExternalPaymentInModal';
import { ExternalProductInModal } from '../../components/forms/ExternalProductInModal';
import { ExternalPaymentOutModal } from '../../components/forms/ExternalPaymentOutModal';

type Modal = 'product-out' | 'payment-in' | 'product-in' | 'payment-out' | null;

interface ExternalTransaction {
  id: string;
  type: 'PRODUCT_OUT' | 'PAYMENT_IN' | 'PRODUCT_IN' | 'PAYMENT_OUT';
  productName: string | null;
  quantity: number | null;
  unitPrice: string | null;
  unitCostUsed: string | null;
  amount: string;
  profit: string | null;
  isLoss: boolean | null;
  notes: string | null;
  createdAt: string;
}

interface ExternalContact {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  role: 'DEBTOR' | 'SUPPLIER' | 'BOTH';
  debtorBalance: string;
  supplierBalance: string;
  transactions: ExternalTransaction[];
}

function txTypeColor(type: ExternalTransaction['type']): string {
  switch (type) {
    case 'PRODUCT_OUT': return 'text-success';
    case 'PAYMENT_IN': return 'text-primary';
    case 'PRODUCT_IN': return 'text-warning';
    case 'PAYMENT_OUT': return 'text-danger';
  }
}

function txSign(type: ExternalTransaction['type']): string {
  return type === 'PAYMENT_IN' || type === 'PRODUCT_IN' ? '+' : '−';
}

export default function ExternalContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const qc = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const [openModal, setOpenModal] = useState<Modal>(null);

  const { data, isLoading } = useQuery({
    queryKey: QK.externalContactDetail(id),
    queryFn: () => externalContactsApi.detail(id),
    staleTime: 30_000,
  });

  const contact = data as ExternalContact | undefined;

  const { mutate: deleteTx } = useMutation({
    mutationFn: (txId: string) => externalContactsApi.deleteTransaction(id, txId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.externalContactDetail(id) });
      qc.invalidateQueries({ queryKey: QK.externalContacts });
    },
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });

  const { mutate: deleteContact } = useMutation({
    mutationFn: () => externalContactsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.externalContacts });
      router.back();
    },
    onError: (err) => Alert.alert(t.common.error, getErrorMessage(err)),
  });

  const handleDeleteTx = (txId: string) => {
    Alert.alert(
      t.externalContacts.deleteTransactionConfirmTitle,
      t.externalContacts.deleteTransactionConfirmMsg,
      [
        { text: t.externalContacts.deleteTransactionCancel, style: 'cancel' },
        { text: t.externalContacts.deleteTransactionConfirm, style: 'destructive', onPress: () => deleteTx(txId) },
      ],
    );
  };

  const handleDeleteContact = () => {
    Alert.alert(
      t.externalContacts.deleteContactConfirmTitle,
      t.externalContacts.deleteContactConfirmMsg,
      [
        { text: t.externalContacts.deleteContactCancel, style: 'cancel' },
        { text: t.externalContacts.deleteContactConfirm, style: 'destructive', onPress: () => deleteContact() },
      ],
    );
  };

  const txLabel = (tx: ExternalTransaction): string => {
    switch (tx.type) {
      case 'PRODUCT_OUT': return t.externalContacts.txProductOut(tx.productName ?? '', tx.quantity ?? 0);
      case 'PAYMENT_IN': return t.externalContacts.txPaymentIn;
      case 'PRODUCT_IN': return t.externalContacts.txProductIn(tx.productName ?? '', tx.quantity ?? 0);
      case 'PAYMENT_OUT': return t.externalContacts.txPaymentOut;
    }
  };

  if (isLoading || !contact) {
    return (
      <View className="flex-1 bg-surface dark:bg-slate-900 items-center justify-center">
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }

  const isDebtor = contact.role === 'DEBTOR' || contact.role === 'BOTH';
  const isSupplier = contact.role === 'SUPPLIER' || contact.role === 'BOTH';

  return (
    <ScrollView className="flex-1 bg-surface dark:bg-slate-900" contentContainerClassName="px-4 pb-12">
      {/* Info card */}
      <View className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-2xl p-4 mt-4 mb-4">
        <View className="flex-row justify-between items-start mb-3">
          <View className="flex-1">
            <Text className="text-text dark:text-slate-100 font-bold text-xl">{contact.name}</Text>
            {contact.phone && (
              <Text className="text-muted dark:text-slate-500 text-sm mt-0.5">{contact.phone}</Text>
            )}
            {contact.notes && (
              <Text className="text-muted dark:text-slate-500 text-xs mt-1 italic">{contact.notes}</Text>
            )}
          </View>
        </View>

        {/* Balances */}
        <View className="flex-row gap-4 pt-3 border-t border-border dark:border-slate-700">
          {isDebtor && (
            <View className="flex-1">
              <Text className="text-muted dark:text-slate-500 text-xs mb-0.5">{t.externalContacts.debtorBalance}</Text>
              <Text className="text-success font-bold text-lg">{formatCurrency(contact.debtorBalance)}</Text>
            </View>
          )}
          {isSupplier && (
            <View className="flex-1">
              <Text className="text-muted dark:text-slate-500 text-xs mb-0.5">{t.externalContacts.supplierBalance}</Text>
              <Text className="text-danger font-bold text-lg">{formatCurrency(contact.supplierBalance)}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Action buttons */}
      <View className="flex-row flex-wrap gap-2 mb-4">
        {isDebtor && (
          <>
            <TouchableOpacity
              onPress={() => setOpenModal('product-out')}
              className="flex-1 min-w-[45%] bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl py-3 items-center"
              activeOpacity={0.8}
            >
              <Text className="text-text dark:text-slate-100 text-sm font-semibold">📦 {t.externalContacts.actionGiveProducts}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setOpenModal('payment-in')}
              className="flex-1 min-w-[45%] bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl py-3 items-center"
              activeOpacity={0.8}
            >
              <Text className="text-text dark:text-slate-100 text-sm font-semibold">💵 {t.externalContacts.actionReceivePayment}</Text>
            </TouchableOpacity>
          </>
        )}
        {isSupplier && (
          <>
            <TouchableOpacity
              onPress={() => setOpenModal('product-in')}
              className="flex-1 min-w-[45%] bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl py-3 items-center"
              activeOpacity={0.8}
            >
              <Text className="text-text dark:text-slate-100 text-sm font-semibold">📥 {t.externalContacts.actionReceiveProducts}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setOpenModal('payment-out')}
              className="flex-1 min-w-[45%] bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl py-3 items-center"
              activeOpacity={0.8}
            >
              <Text className="text-text dark:text-slate-100 text-sm font-semibold">💸 {t.externalContacts.actionMakePayment}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Transaction history */}
      {contact.transactions.length === 0 ? (
        <View className="items-center mt-8">
          <Text className="text-3xl mb-2">📋</Text>
          <Text className="text-text dark:text-slate-100 font-semibold">{t.externalContacts.noTransactions}</Text>
          <Text className="text-muted dark:text-slate-500 text-sm text-center mt-1">{t.externalContacts.noTransactionsSub}</Text>
        </View>
      ) : (
        contact.transactions.map((tx) => (
          <View key={tx.id} className="bg-card dark:bg-slate-800 border border-border dark:border-slate-700 rounded-xl p-3 mb-2">
            <View className="flex-row justify-between items-start">
              <View className="flex-1 mr-2">
                <Text className="text-text dark:text-slate-100 font-semibold text-sm">{txLabel(tx)}</Text>
                {tx.type === 'PRODUCT_OUT' && tx.unitCostUsed && tx.unitPrice && (
                  <Text className="text-muted dark:text-slate-500 text-xs mt-0.5">
                    Cost {formatCurrency(tx.unitCostUsed)} · Sell {formatCurrency(tx.unitPrice)}/unit
                  </Text>
                )}
                {tx.notes && (
                  <Text className="text-muted dark:text-slate-500 text-xs mt-0.5">{tx.notes}</Text>
                )}
                <Text className="text-muted dark:text-slate-500 text-xs mt-0.5">
                  {new Date(tx.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <View className="items-end">
                <Text className={`font-bold text-base ${txTypeColor(tx.type)}`}>
                  {txSign(tx.type)}{formatCurrency(tx.amount)}
                </Text>
                {tx.profit != null && (
                  <Text className={`text-xs font-medium mt-0.5 ${tx.isLoss ? 'text-danger' : 'text-success'}`}>
                    {tx.isLoss ? '▼' : '▲'} {formatCurrency(Math.abs(parseFloat(tx.profit)).toFixed(2))}
                  </Text>
                )}
                <TouchableOpacity onPress={() => handleDeleteTx(tx.id)} hitSlop={8} className="mt-1">
                  <Text className="text-danger text-xs">{t.externalContacts.deleteTransaction}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))
      )}

      {/* Delete contact */}
      <TouchableOpacity onPress={handleDeleteContact} className="mt-6 py-3 rounded-xl border border-danger items-center">
        <Text className="text-danger font-semibold text-sm">{t.externalContacts.deleteContact}</Text>
      </TouchableOpacity>

      {/* Modals */}
      <ExternalProductOutModal visible={openModal === 'product-out'} onClose={() => setOpenModal(null)} contactId={id} />
      <ExternalPaymentInModal visible={openModal === 'payment-in'} onClose={() => setOpenModal(null)} contactId={id} />
      <ExternalProductInModal visible={openModal === 'product-in'} onClose={() => setOpenModal(null)} contactId={id} />
      <ExternalPaymentOutModal visible={openModal === 'payment-out'} onClose={() => setOpenModal(null)} contactId={id} />
    </ScrollView>
  );
}

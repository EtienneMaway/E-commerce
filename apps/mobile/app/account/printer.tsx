import { useEffect, useState } from 'react';
import { ScrollView, View, Text, Pressable, Alert, ActivityIndicator } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { usePrinterStore } from '../../store/printer.store';
import {
  listPairedPrinters,
  testPrint,
  type PairedPrinter,
} from '../../lib/bluetooth-printer';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';

export default function PrinterScreen() {
  const t = useT();
  const { printer: selected, setPrinter, hydrate } = usePrinterStore();
  const [devices, setDevices] = useState<PairedPrinter[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
    void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scan = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listPairedPrinters();
      setDevices(list);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (device: PairedPrinter) => {
    await setPrinter(device);
  };

  const handleForget = async () => {
    await setPrinter(null);
  };

  const handleTest = async () => {
    if (!selected) return;
    setTesting(true);
    try {
      await testPrint(selected);
      Alert.alert(t.printer.testPrintOk);
    } catch (err) {
      Alert.alert(t.printer.testPrintFailed, getErrorMessage(err));
    } finally {
      setTesting(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-surface dark:bg-slate-900"
      contentContainerClassName="px-4 pt-4 pb-8"
    >
      <Text className="text-muted dark:text-slate-400 text-sm mb-4">
        {t.printer.subtitle}
      </Text>

      {/* Currently selected */}
      <Card>
        <Text className="text-muted dark:text-slate-500 text-xs uppercase font-medium tracking-wide mb-1">
          {t.printer.pairedLabel}
        </Text>
        {selected ? (
          <View>
            <Text className="text-text dark:text-slate-100 text-base font-semibold">
              🖨 {selected.name}
            </Text>
            <Text className="text-muted dark:text-slate-500 text-xs mt-0.5">
              {selected.address}
            </Text>
            <View className="flex-row gap-2 mt-3">
              <View className="flex-1">
                <Button
                  label={testing ? t.printer.testing : t.printer.testPrintBtn}
                  onPress={handleTest}
                  loading={testing}
                  variant="outline"
                />
              </View>
              <View className="flex-1">
                <Button
                  label={t.printer.forgetBtn}
                  onPress={handleForget}
                  variant="danger"
                />
              </View>
            </View>
          </View>
        ) : (
          <Text className="text-muted dark:text-slate-400 text-sm">{t.printer.none}</Text>
        )}
      </Card>

      <Text className="text-muted dark:text-slate-500 text-xs mt-5 mb-3 leading-5">
        {t.printer.pairInOsHint}
      </Text>

      <Button
        label={loading ? t.printer.refreshing : t.printer.refreshBtn}
        onPress={scan}
        loading={loading}
        variant="outline"
      />

      {error && (
        <Text className="text-danger text-xs mt-3">{error}</Text>
      )}

      {/* Paired devices list */}
      <View className="mt-5">
        {loading && devices.length === 0 ? (
          <View className="py-6 items-center">
            <ActivityIndicator />
          </View>
        ) : (
          devices.map((d) => {
            const isSelected = selected?.address === d.address;
            return (
              <Pressable
                key={d.address}
                onPress={() => !isSelected && handleSelect(d)}
                className={`bg-card dark:bg-slate-800 border rounded-xl px-4 py-3 mb-2 flex-row items-center justify-between ${
                  isSelected
                    ? 'border-primary'
                    : 'border-border dark:border-slate-700'
                }`}
              >
                <View className="flex-1 pr-3">
                  <Text className="text-text dark:text-slate-100 font-semibold text-sm">
                    {d.name}
                  </Text>
                  <Text className="text-muted dark:text-slate-500 text-xs mt-0.5">
                    {d.address}
                  </Text>
                </View>
                <Text className={`text-xs font-semibold ${isSelected ? 'text-primary' : 'text-muted dark:text-slate-400'}`}>
                  {isSelected ? `✓ ${t.printer.selectedBtn}` : t.printer.selectBtn}
                </Text>
              </Pressable>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

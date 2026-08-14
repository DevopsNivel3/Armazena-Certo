import { useRef, useState } from 'react';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Modal, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, common } from '../theme';

type Result = { accepted: boolean; keepOpen: boolean; message: string };
type Props = { visible: boolean; continuous: boolean; onClose: () => void; onScan: (code: string) => Promise<Result> };

const barcodeTypes = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'codabar', 'datamatrix', 'qr'] as const;

export function ScannerSheet({ visible, continuous, onClose, onScan }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const lastRef = useRef({ code: '', at: 0 });

  const scanned = async ({ data }: BarcodeScanningResult) => {
    const code = String(data || '').trim();
    const now = Date.now();
    if (!code || processing || (lastRef.current.code === code && now - lastRef.current.at < 1500)) return;
    lastRef.current = { code, at: now };
    setProcessing(true);
    setMessage('Validando leitura...');
    try {
      const result = await onScan(code);
      setMessage(result.message);
      if (result.accepted && !result.keepOpen) onClose();
    } finally {
      setTimeout(() => setProcessing(false), 500);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}><Text style={styles.title}>{continuous ? 'Contagem contínua +1' : 'Identificar produto'}</Text><Text style={styles.subtitle}>{continuous ? 'A câmera fica aberta para o próximo bip.' : 'Revise os dados antes de salvar.'}</Text></View>
          <TouchableOpacity style={styles.close} onPress={onClose}><Text style={styles.closeText}>Fechar</Text></TouchableOpacity>
        </View>
        {!permission?.granted ? (
          <View style={styles.permission}><Text style={styles.permissionTitle}>Acesso à câmera</Text><Text style={styles.permissionText}>Precisamos da câmera para ler os códigos de barras.</Text><TouchableOpacity style={common.primaryButton} onPress={requestPermission}><Text style={common.primaryButtonText}>Permitir câmera</Text></TouchableOpacity></View>
        ) : (
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={torch}
              autofocus="on"
              barcodeScannerSettings={{ barcodeTypes: [...barcodeTypes] }}
              onBarcodeScanned={processing ? undefined : scanned}
            />
            <View pointerEvents="none" style={styles.target}><View style={styles.line} /></View>
            {message ? <Text style={styles.message}>{message}</Text> : null}
            <TouchableOpacity style={styles.torch} onPress={() => setTorch((value) => !value)}><Text style={styles.torchText}>{torch ? 'Apagar luz' : 'Acender luz'}</Text></TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink }, header: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: colors.white, fontSize: 20, fontWeight: '900' }, subtitle: { color: '#cbd5e1', fontSize: 12, marginTop: 3 },
  close: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 13, backgroundColor: '#1e293b' }, closeText: { color: colors.white, fontWeight: '800' },
  cameraWrap: { flex: 1, overflow: 'hidden' }, target: { position: 'absolute', left: '8%', right: '8%', top: '36%', height: 150, borderRadius: 20, borderWidth: 3, borderColor: '#22d3ee', justifyContent: 'center', overflow: 'hidden' },
  line: { height: 2, backgroundColor: '#67e8f9', marginHorizontal: 15 }, message: { position: 'absolute', left: 18, right: 18, top: 20, backgroundColor: 'rgba(7,17,31,0.86)', color: colors.white, borderRadius: 14, padding: 13, textAlign: 'center', fontWeight: '800' },
  torch: { position: 'absolute', alignSelf: 'center', bottom: 28, minWidth: 140, padding: 15, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.94)' }, torchText: { textAlign: 'center', fontWeight: '900', color: colors.ink },
  permission: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 15 }, permissionTitle: { color: colors.white, fontSize: 24, fontWeight: '900' }, permissionText: { color: '#cbd5e1', textAlign: 'center', marginBottom: 10 }
});

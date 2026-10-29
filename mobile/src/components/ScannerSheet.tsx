import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { KeyboardAvoidingView, Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { colors, common } from '../theme';

type Result = { accepted: boolean; keepOpen: boolean; pause?: boolean; message: string };
type Props = { visible: boolean; continuous: boolean; paused?: boolean; children?: ReactNode; entryScrollRef?: RefObject<ScrollView | null>; onEntryLayout?: () => void; onClose: () => void; onScan: (code: string) => Promise<Result> };
type FeedbackTone = 'idle' | 'reading' | 'success' | 'error';
type Feedback = { tone: FeedbackTone; title: string; detail: string; code: string };

// Somente formatos lineares usados na operação. Menos detectores simultâneos deixam o ML Kit mais responsivo.
const barcodeTypes = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'codabar'] as const;
const initialFeedback: Feedback = {
  tone: 'idle',
  title: 'Aguardando código',
  detail: 'Centralize as barras dentro do quadro e mantenha o aparelho firme.',
  code: ''
};

export function ScannerSheet({ visible, continuous, paused = false, children, entryScrollRef, onEntryLayout, onClose, onScan }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(initialFeedback);
  const [cameraSize, setCameraSize] = useState({ width: 0, height: 0 });
  const processingRef = useRef(false);
  const lastRef = useRef({ code: '', seenAt: 0 });
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pausedRef = useRef(paused);
  const sessionRef = useRef(0);
  pausedRef.current = paused;

  useEffect(() => {
    if (!paused) {
      processingRef.current = false;
      lastRef.current.seenAt = Date.now();
    }
  }, [paused]);

  useEffect(() => {
    if (visible) {
      processingRef.current = false;
      lastRef.current = { code: '', seenAt: 0 };
      setFeedback(initialFeedback);
    }
    return () => {
      sessionRef.current += 1;
      if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    };
  }, [visible]);

  const guidanceFor = ({ bounds }: BarcodeScanningResult) => {
    if (!cameraSize.width || !cameraSize.height || !bounds?.size) return 'Código detectado. Mantenha firme.';
    const width = Math.abs(Number(bounds.size.width || 0));
    const height = Math.abs(Number(bounds.size.height || 0));
    const spanRatio = Math.max(width, height) / cameraSize.width;
    const centerX = Number(bounds.origin?.x || 0) + width / 2;
    const centerY = Number(bounds.origin?.y || 0) + height / 2;

    if (spanRatio > 0 && spanRatio < 0.24) return 'Aproxime um pouco o aparelho.';
    if (spanRatio > 0.82) return 'Afaste um pouco o aparelho.';
    if (
      centerX < cameraSize.width * 0.14
      || centerX > cameraSize.width * 0.86
      || centerY < cameraSize.height * 0.28
      || centerY > cameraSize.height * 0.68
    ) return 'Centralize o código dentro do quadro.';
    return 'Distância boa. Mantenha firme.';
  };

  const releaseScanner = (delay: number) => {
    if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = setTimeout(() => {
      processingRef.current = false;
    }, delay);
  };

  const scanned = async (scan: BarcodeScanningResult) => {
    const code = String(scan.data || '').trim();
    const now = Date.now();
    if (!code || pausedRef.current || !visible) return;
    const session = sessionRef.current;

    // Enquanto o mesmo código continuar visível, atualizamos seenAt e não contamos novamente.
    // Para repetir o mesmo produto, basta retirar a etiqueta do quadro por um instante e reapresentá-la.
    if (lastRef.current.code === code) {
      const absentFor = now - lastRef.current.seenAt;
      lastRef.current.seenAt = now;
      if (processingRef.current || absentFor < 650) return;
    } else if (processingRef.current) {
      return;
    }

    processingRef.current = true;
    lastRef.current = { code, seenAt: now };
    setFeedback({ tone: 'reading', title: 'Código lido agora', detail: guidanceFor(scan), code });

    try {
      const result = await onScan(code);
      if (sessionRef.current !== session) return;
      if (result.pause) pausedRef.current = true;
      setFeedback({
        tone: result.accepted ? 'success' : 'error',
        title: result.accepted ? 'Produto encontrado' : 'Produto não encontrado',
        detail: result.message,
        code
      });

      if (result.accepted && !result.keepOpen) {
        onClose();
        return;
      }

      if (!result.pause) releaseScanner(result.accepted ? 90 : 500);
    } catch (error) {
      setFeedback({
        tone: 'error',
        title: 'Falha ao validar leitura',
        detail: error instanceof Error ? error.message : 'Tente novamente.',
        code
      });
      releaseScanner(500);
    }
  };

  const onCameraLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCameraSize({ width, height });
  };

  const frameStyle = feedback.tone === 'success'
    ? styles.targetSuccess
    : feedback.tone === 'error'
      ? styles.targetError
      : feedback.tone === 'reading'
        ? styles.targetReading
        : null;
  const panelStyle = feedback.tone === 'success'
    ? styles.panelSuccess
    : feedback.tone === 'error'
      ? styles.panelError
      : feedback.tone === 'reading'
        ? styles.panelReading
        : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{continuous ? 'Contagem contínua' : 'Identificar produto'}</Text>
            <Text style={styles.subtitle}>{continuous ? 'Leia o código e informe a quantidade.' : 'Revise os dados antes de salvar.'}</Text>
          </View>
          <TouchableOpacity style={styles.close} onPress={onClose}><Text style={styles.closeText}>Fechar</Text></TouchableOpacity>
        </View>
        {!visible ? null : !permission?.granted ? (
          <View style={styles.permission}>
            <Text style={styles.permissionTitle}>Acesso à câmera</Text>
            <Text style={styles.permissionText}>Precisamos da câmera para ler os códigos de barras.</Text>
            <TouchableOpacity style={common.primaryButton} onPress={requestPermission}><Text style={common.primaryButtonText}>Permitir câmera</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraWrap} onLayout={onCameraLayout}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={torch}
              autofocus="on"
              barcodeScannerSettings={{ barcodeTypes: [...barcodeTypes] }}
              onCameraReady={() => setFeedback(initialFeedback)}
              onMountError={({ message }) => setFeedback({ tone: 'error', title: 'Câmera indisponível', detail: message, code: '' })}
              onBarcodeScanned={paused ? undefined : scanned}
            />
            <View pointerEvents="none" style={[styles.target, frameStyle]}><View style={styles.line} /></View>
            <View pointerEvents="none" style={[styles.panel, panelStyle]}>
              <Text style={styles.panelEyebrow}>LEITURA ATUAL</Text>
              <Text style={styles.panelTitle}>{feedback.title}</Text>
              {feedback.code ? <Text style={styles.panelCode} numberOfLines={1}>{feedback.code}</Text> : null}
              <Text style={styles.panelDetail}>{feedback.detail}</Text>
            </View>
            <View pointerEvents="none" style={styles.tip}><Text style={styles.tipText}>{continuous ? 'Para repetir o mesmo item, retire a etiqueta do quadro e apresente novamente.' : 'Sem leitura? Limpe a lente, evite reflexos e deixe todas as barras visíveis.'}</Text></View>
            <TouchableOpacity style={styles.torch} onPress={() => setTorch((value) => !value)}><Text style={styles.torchText}>{torch ? 'Apagar luz' : 'Acender luz'}</Text></TouchableOpacity>
          </View>
        )}
        {children && <KeyboardAvoidingView style={styles.entryOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView ref={entryScrollRef} style={styles.entryViewport} onLayout={onEntryLayout} onContentSizeChange={onEntryLayout} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.entryScroll}>{children}</ScrollView></KeyboardAvoidingView>}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  entryOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,17,31,0.48)', justifyContent: 'flex-end', paddingTop: 12 },
  entryViewport: { flex: 1 },
  entryScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  screen: { flex: 1, backgroundColor: colors.ink },
  header: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: colors.white, fontSize: 20, fontWeight: '900' },
  subtitle: { color: '#cbd5e1', fontSize: 12, marginTop: 3 },
  close: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 13, backgroundColor: '#1e293b' },
  closeText: { color: colors.white, fontWeight: '800' },
  cameraWrap: { flex: 1, overflow: 'hidden' },
  target: { position: 'absolute', left: '7%', right: '7%', top: '34%', height: 164, borderRadius: 20, borderWidth: 3, borderColor: '#22d3ee', justifyContent: 'center', overflow: 'hidden' },
  targetReading: { borderColor: '#fbbf24' },
  targetSuccess: { borderColor: '#34d399', borderWidth: 5 },
  targetError: { borderColor: '#fb7185', borderWidth: 5 },
  line: { height: 2, backgroundColor: '#67e8f9', marginHorizontal: 15 },
  panel: { position: 'absolute', left: 16, right: 16, top: 16, minHeight: 118, borderRadius: 18, padding: 14, backgroundColor: 'rgba(7,17,31,0.90)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  panelReading: { borderColor: '#fbbf24' },
  panelSuccess: { backgroundColor: 'rgba(4,120,87,0.94)', borderColor: '#6ee7b7' },
  panelError: { backgroundColor: 'rgba(159,18,57,0.94)', borderColor: '#fda4af' },
  panelEyebrow: { color: '#a5f3fc', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  panelTitle: { color: colors.white, fontSize: 18, fontWeight: '900', marginTop: 4 },
  panelCode: { color: colors.white, fontSize: 16, fontWeight: '900', letterSpacing: 1.2, marginTop: 5 },
  panelDetail: { color: '#e2e8f0', fontSize: 12, fontWeight: '700', marginTop: 5 },
  tip: { position: 'absolute', left: 18, right: 18, bottom: 94, alignItems: 'center' },
  tipText: { color: colors.white, fontSize: 11, fontWeight: '700', textAlign: 'center', backgroundColor: 'rgba(7,17,31,0.72)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  torch: { position: 'absolute', alignSelf: 'center', bottom: 28, minWidth: 140, padding: 15, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.94)' },
  torchText: { textAlign: 'center', fontWeight: '900', color: colors.ink },
  permission: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 15 },
  permissionTitle: { color: colors.white, fontSize: 24, fontWeight: '900' },
  permissionText: { color: '#cbd5e1', textAlign: 'center', marginBottom: 10 }
});

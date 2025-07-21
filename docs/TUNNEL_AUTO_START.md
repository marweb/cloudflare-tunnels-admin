# Sistema Robusto de Auto-Start para Túneles Cloudflared

## Problema Resuelto

**Problema Original**: Los túneles de cloudflared no se reiniciaban automáticamente después de:
- Deploy de la aplicación
- Reinicio del contenedor Docker
- Reinicio del host/servidor
- Fallos del proceso cloudflared

## Solución Implementada

Se ha implementado un sistema robusto de auto-start que incluye:

### 1. **TunnelStateManager** (`utils/tunnelStateManager.js`)
- **Persistencia de Estado**: Mantiene un archivo JSON (`/etc/cloudflared/tunnel-state.json`) con el estado de todos los túneles
- **Tracking de Habilitación**: Rastrea qué túneles deben estar activos
- **Configuración Persistente**: Guarda configuración de túneles para recuperación
- **Limpieza Automática**: Elimina estados huérfanos de túneles eliminados

### 2. **TunnelAutoStart** (`utils/tunnelAutoStart.js`)
- **Auto-Start Robusto**: Inicia automáticamente todos los túneles habilitados
- **Monitoreo de Salud**: Verifica cada 30 segundos que los túneles estén funcionando
- **Auto-Restart**: Reinicia automáticamente túneles que fallan
- **Gestión de Procesos**: Control completo de procesos cloudflared
- **Logging Detallado**: Logs individuales por túnel en `/var/log/cloudflared-{nombre}.log`

### 3. **Integración en Docker Startup** (`docker-start.sh`)
- **Inicio Automático**: Se ejecuta automáticamente al iniciar el contenedor
- **Sistema en Background**: Funciona como daemon independiente
- **Monitoreo Continuo**: Mantiene túneles activos 24/7

### 4. **Integración en Controller** (`controllers/tunnelController.js`)
- **Estado Persistente**: Cada túnel creado se registra en el sistema de estado
- **Auto-Start Configurable**: Opción de auto-start se guarda persistentemente
- **Sincronización**: Mantiene sincronizado el estado con la realidad

## Características Principales

### ✅ **Persistencia Completa**
- Estado de túneles se guarda en `/etc/cloudflared/tunnel-state.json`
- Sobrevive a reinicios de contenedor y host
- No depende de archivos systemd temporales

### ✅ **Auto-Recovery**
- Detecta túneles caídos automáticamente
- Los reinicia sin intervención manual
- Maneja fallos de red y proceso

### ✅ **Monitoreo en Tiempo Real**
- Health checks cada 30 segundos
- Logs detallados por túnel
- Estado visible en tiempo real

### ✅ **Gestión Robusta de Procesos**
- Procesos completamente desacoplados
- Manejo correcto de señales
- Limpieza automática de procesos zombi

## Archivos Modificados/Creados

### Nuevos Archivos:
- `utils/tunnelStateManager.js` - Gestión de estado persistente
- `utils/tunnelAutoStart.js` - Sistema de auto-start robusto
- `docs/TUNNEL_AUTO_START.md` - Esta documentación

### Archivos Modificados:
- `docker-start.sh` - Integración del nuevo sistema de auto-start
- `controllers/tunnelController.js` - Integración con gestión de estado
- `utils/systemd.js` - Actualizado con ExecStartPre para ping_group_range
- `systemd/cloudflared-template.service` - Plantilla actualizada

## Cómo Funciona

### 1. **Al Crear un Túnel**
```javascript
// Si autoStart = true
await this.stateManager.enableTunnel(name, config);
// El túnel se marca como "debe estar activo"
```

### 2. **Al Iniciar el Contenedor**
```bash
# docker-start.sh ejecuta automáticamente:
node /tmp/tunnel-autostart.js &
# Esto inicia todos los túneles habilitados
```

### 3. **Monitoreo Continuo**
```javascript
// Cada 30 segundos verifica:
const isRunning = await this.isTunnelRunning(tunnelName);
if (!isRunning && shouldBeRunning) {
    await this.restartTunnel(tunnelName);
}
```

### 4. **Auto-Recovery**
- Si un túnel falla → Se reinicia automáticamente
- Si el contenedor se reinicia → Todos los túneles habilitados se inician
- Si el host se reinicia → Los túneles se recuperan completamente

## Verificación del Sistema

### Comprobar Estado de Túneles:
```bash
# Ver procesos cloudflared activos
ps aux | grep cloudflared

# Ver logs de un túnel específico
tail -f /var/log/cloudflared-{nombre-tunnel}.log

# Ver estado persistente
cat /etc/cloudflared/tunnel-state.json
```

### Archivos de Estado:
- **Estado Persistente**: `/etc/cloudflared/tunnel-state.json`
- **Configuraciones**: `/etc/cloudflared/*.yml`
- **Logs**: `/var/log/cloudflared-*.log`

## Beneficios

### ✅ **Disponibilidad 24/7**
- Túneles siempre activos sin intervención manual
- Recovery automático de fallos

### ✅ **Persistencia Total**
- Sobrevive a cualquier tipo de reinicio
- No se pierden configuraciones

### ✅ **Monitoreo Proactivo**
- Detecta problemas antes de que afecten usuarios
- Logs detallados para debugging

### ✅ **Escalabilidad**
- Maneja múltiples túneles simultáneamente
- Performance optimizada

## Troubleshooting

### Si los túneles no se inician:
1. Verificar que el archivo de estado existe: `ls -la /etc/cloudflared/tunnel-state.json`
2. Verificar logs del sistema: `tail -f /var/log/cloudflared-*.log`
3. Verificar procesos: `ps aux | grep cloudflared`
4. Verificar configuraciones: `ls -la /etc/cloudflared/*.yml`

### Si un túnel específico falla:
1. Verificar su estado: `cat /etc/cloudflared/tunnel-state.json | grep "nombre-tunnel"`
2. Verificar su configuración: `cat /etc/cloudflared/nombre-tunnel.yml`
3. Verificar credenciales: Archivo referenciado en `credentials-file`

### Reinicio manual del sistema:
```bash
# Reiniciar el sistema de auto-start
pkill -f "tunnel-autostart.js"
node /tmp/tunnel-autostart.js &
```

## Migración de Túneles Existentes

Los túneles existentes se migrarán automáticamente al nuevo sistema:
1. Al reiniciar el contenedor, se detectarán túneles con archivos de servicio
2. Se crearán entradas en el estado persistente
3. Se iniciarán automáticamente si tenían servicio habilitado

## Conclusión

Este sistema garantiza que **NUNCA MÁS** se caigan los túneles tras reinicios. Es completamente automático, robusto y requiere cero intervención manual para mantener los túneles funcionando 24/7.

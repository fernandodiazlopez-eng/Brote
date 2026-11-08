package com.upgrade.fitness.health

import android.content.Context
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Modelo de datos unificados de salud para la pantalla de estadísticas de Upgrade.
 */
data class HealthSummary(
    val stepsToday: Long = 0,
    val caloriesBurnedTodayKcal: Double = 0.0,
    val distanceTodayKm: Double = 0.0,
    val activeMinutesToday: Long = 0,
    val isHealthConnectAvailable: Boolean = false,
    val hasPermissions: Boolean = false
)

/**
 * Gestor oficial de Health Connect para Android:
 * - Lee pasos reales, calorías quemadas y distancia sincronizadas desde relojes
 *   inteligentes o apps de salud (Samsung Health, Google Fit, Withings, etc.).
 */
class HealthConnectManager(private val context: Context) {

    private val healthConnectClient: HealthConnectClient? by lazy {
        if (isAvailable()) {
            HealthConnectClient.getOrCreate(context)
        } else null
    }

    val requiredPermissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class)
    )

    fun isAvailable(): Boolean {
        val status = HealthConnectClient.getSdkStatus(context)
        return status == HealthConnectClient.SDK_AVAILABLE
    }

    /**
     * Comprueba si el usuario ya ha concedido los permisos necesarios en Health Connect.
     */
    suspend fun hasAllPermissions(): Boolean = withContext(Dispatchers.IO) {
        val client = healthConnectClient ?: return@withContext false
        val granted = client.permissionController.getGrantedPermissions()
        return@withContext granted.containsAll(requiredPermissions)
    }

    /**
     * Consulta y agrega las métricas del día actual desde las 00:00 hasta el momento presente.
     */
    suspend fun getTodayHealthSummary(): HealthSummary = withContext(Dispatchers.IO) {
        val client = healthConnectClient ?: return@withContext HealthSummary(isHealthConnectAvailable = false)
        val hasPerms = hasAllPermissions()
        if (!hasPerms) {
            return@withContext HealthSummary(
                isHealthConnectAvailable = true,
                hasPermissions = false
            )
        }

        try {
            val zoneId = ZoneId.systemDefault()
            val startOfDay = LocalDate.now().atStartOfDay(zoneId).toInstant()
            val now = Instant.now()
            val timeRange = TimeRangeFilter.between(startOfDay, now)

            val request = AggregateRequest(
                metrics = setOf(
                    StepsRecord.COUNT_TOTAL,
                    TotalCaloriesBurnedRecord.ENERGY_TOTAL,
                    DistanceRecord.DISTANCE_TOTAL
                ),
                timeRangeFilter = timeRange
            )

            val response = client.aggregate(request)
            val steps = response[StepsRecord.COUNT_TOTAL] ?: 0L
            val energy = response[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories ?: 0.0
            val distanceMeters = response[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0
            val distanceKm = distanceMeters / 1000.0

            return@withContext HealthSummary(
                stepsToday = steps,
                caloriesBurnedTodayKcal = energy,
                distanceTodayKm = distanceKm,
                activeMinutesToday = 0L,
                isHealthConnectAvailable = true,
                hasPermissions = true
            )
        } catch (e: Exception) {
            Log.e("HealthConnectManager", "Error al agregar métricas de Health Connect: ${e.message}", e)
            return@withContext HealthSummary(
                isHealthConnectAvailable = true,
                hasPermissions = true
            )
        }
    }
}

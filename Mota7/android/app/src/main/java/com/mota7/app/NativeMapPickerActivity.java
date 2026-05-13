package com.mota7.app;

import android.content.Intent;
import android.location.Address;
import android.location.Geocoder;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import com.google.android.gms.maps.CameraUpdateFactory;
import com.google.android.gms.maps.GoogleMap;
import com.google.android.gms.maps.OnMapReadyCallback;
import com.google.android.gms.maps.SupportMapFragment;
import com.google.android.gms.maps.model.LatLng;
import com.google.android.gms.maps.model.Marker;
import com.google.android.gms.maps.model.MarkerOptions;
import java.io.IOException;
import java.util.List;
import java.util.Locale;

public class NativeMapPickerActivity extends AppCompatActivity implements OnMapReadyCallback {
    public static final String EXTRA_LAT = "extra_lat";
    public static final String EXTRA_LNG = "extra_lng";
    public static final String EXTRA_TITLE = "extra_title";
    public static final String RESULT_LAT = "result_lat";
    public static final String RESULT_LNG = "result_lng";
    public static final String RESULT_ADDRESS = "result_address";

    private GoogleMap map;
    private Marker marker;
    private LatLng selected;
    private TextView addressView;
    private TextView coordsView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_native_map_picker);

        addressView = findViewById(R.id.nativeMapAddress);
        coordsView = findViewById(R.id.nativeMapCoords);
        Button closeBtn = findViewById(R.id.nativeMapCloseBtn);
        Button confirmBtn = findViewById(R.id.nativeMapConfirmBtn);

        String title = getIntent().getStringExtra(EXTRA_TITLE);
        if (title != null && !title.trim().isEmpty()) {
            TextView titleView = findViewById(R.id.nativeMapTitle);
            titleView.setText(title.trim());
        }

        closeBtn.setOnClickListener(v -> finish());
        confirmBtn.setOnClickListener(v -> confirmSelection());

        SupportMapFragment mapFragment =
            (SupportMapFragment) getSupportFragmentManager().findFragmentById(R.id.nativeMapFragment);
        if (mapFragment != null) {
            mapFragment.getMapAsync(this);
        }
    }

    @Override
    public void onMapReady(@NonNull GoogleMap googleMap) {
        this.map = googleMap;

        double lat = getIntent().getDoubleExtra(EXTRA_LAT, 25.4374d);
        double lng = getIntent().getDoubleExtra(EXTRA_LNG, 30.5465d);
        selected = new LatLng(lat, lng);

        marker = map.addMarker(new MarkerOptions().position(selected).draggable(true));
        map.moveCamera(CameraUpdateFactory.newLatLngZoom(selected, 15f));

        map.setOnMapClickListener(latLng -> updateSelected(latLng));
        map.setOnCameraIdleListener(() -> {
            if (map != null) {
                updateSelected(map.getCameraPosition().target);
            }
        });
        map.setOnMarkerDragListener(new GoogleMap.OnMarkerDragListener() {
            @Override public void onMarkerDragStart(@NonNull Marker marker) {}
            @Override public void onMarkerDrag(@NonNull Marker marker) {}
            @Override public void onMarkerDragEnd(@NonNull Marker marker) {
                updateSelected(marker.getPosition());
            }
        });

        updateUiForSelected(selected);
    }

    private void updateSelected(@NonNull LatLng latLng) {
        selected = latLng;
        if (marker != null) {
            marker.setPosition(latLng);
        }
        updateUiForSelected(latLng);
    }

    private void updateUiForSelected(@NonNull LatLng latLng) {
        coordsView.setText(String.format(Locale.US, "%.6f, %.6f", latLng.latitude, latLng.longitude));
        String address = reverseGeocode(latLng);
        addressView.setText(address);
    }

    private String reverseGeocode(@NonNull LatLng latLng) {
        try {
            Geocoder geocoder = new Geocoder(this, new Locale("ar"));
            List<Address> rows = geocoder.getFromLocation(latLng.latitude, latLng.longitude, 1);
            if (rows != null && !rows.isEmpty()) {
                Address a = rows.get(0);
                String line = a.getAddressLine(0);
                if (line != null && !line.trim().isEmpty()) {
                    return line.trim();
                }
            }
        } catch (IOException ignored) {
        } catch (IllegalArgumentException ignored) {
        }
        return String.format(Locale.US, "%.6f, %.6f", latLng.latitude, latLng.longitude);
    }

    private void confirmSelection() {
        if (selected == null) {
            return;
        }
        Intent out = new Intent();
        out.putExtra(RESULT_LAT, selected.latitude);
        out.putExtra(RESULT_LNG, selected.longitude);
        String address = addressView != null ? String.valueOf(addressView.getText()) : "";
        out.putExtra(RESULT_ADDRESS, address);
        setResult(RESULT_OK, out);
        finish();
    }
}

